package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/segmentio/kafka-go"
)

type LogMessage struct {
	Timestamp  string `json:"Timestamp"`
	Level      string `json:"Level"`
	Message    string `json:"Message"`
	ResourceID string `json:"ResourceID"`
}

type KafkaMessageProducer struct {
	writer     *kafka.Writer
	metrics    struct {
		sentCount  uint32
		errorCount uint32
		startTime  time.Time
		endTime    time.Time
	}
}

func NewKafkaMessageProducer(brokers []string, topic string) *KafkaMessageProducer {
	producer := &KafkaMessageProducer{}
	producer.writer = &kafka.Writer{
		Addr:         kafka.TCP(brokers...),
		Topic:        topic,
		BatchSize:    4000,
		BatchBytes:   128 * 1024,
		BatchTimeout: 50 * time.Millisecond,
		Async:        true,
		RequiredAcks: kafka.RequireOne,
		Compression:  kafka.Snappy,
		MaxAttempts:  3,
		WriteBackoffMin: 10 * time.Millisecond,
        WriteBackoffMax: 500 * time.Millisecond,
	}

	return producer
}

func (p *KafkaMessageProducer) SendMessage(ctx context.Context, message []byte) bool {
	
	
	err := p.writer.WriteMessages(ctx, kafka.Message{
		Value: message,
	})

	if err != nil {
        atomic.AddUint32(&p.metrics.errorCount, 1) // Atomic increment
        return false
    }

    atomic.AddUint32(&p.metrics.sentCount, 1) // Atomic increment
    return true
}

func (p *KafkaMessageProducer) SendMessagesInGoroutine(ctx context.Context, messages [][]byte, goroutineID int) {
	for _, msg := range messages {
		p.SendMessage(ctx, msg)
	}
}

func (p *KafkaMessageProducer) SendMessagesParallel(ctx context.Context, messages [][]byte, numGoroutines int) map[string]interface{} {
	p.metrics.startTime = time.Now()

	msgsPerGoroutine := len(messages) / numGoroutines
	if msgsPerGoroutine == 0 {
		msgsPerGoroutine = 1
		numGoroutines = min(numGoroutines, len(messages))
	}

	var wg sync.WaitGroup
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)

		startIdx := i * msgsPerGoroutine
		endIdx := startIdx + msgsPerGoroutine
		if i == numGoroutines-1 {
			endIdx = len(messages)
		}

		goroutineMessages := messages[startIdx:endIdx]

		go func(id int, msgs [][]byte) {
			defer wg.Done()
			p.SendMessagesInGoroutine(ctx, msgs, id)
		}(i, goroutineMessages)
	}

	wg.Wait()

	p.metrics.endTime = time.Now()
	duration := p.metrics.endTime.Sub(p.metrics.startTime).Seconds()
	rate := float64(p.metrics.sentCount) / duration
    sentCount := atomic.LoadUint32(&p.metrics.sentCount)
    errorCount := atomic.LoadUint32(&p.metrics.errorCount)
	fmt.Printf("Completed sending %d messages in %.2f seconds\n", sentCount, duration)
	fmt.Printf("Throughput: %.2f messages/second\n", rate)
	fmt.Printf("Errors: %d\n", errorCount)

	return map[string]interface{}{
		"messages_sent":     sentCount,
		"errors":            errorCount,
		"duration_seconds":  duration,
		"throughput":        rate,
	}
}

func (p *KafkaMessageProducer) Close() {
	p.writer.Close()
}

func GenerateLogMessage(i int) LogMessage {
	logLevels := []string{"INFO", "WARN", "ERROR", "DEBUG"}
	return LogMessage{
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Level:      logLevels[rand.Intn(len(logLevels))],
		Message:    fmt.Sprintf("Test log message %d", i),
		ResourceID: fmt.Sprintf("resource-%d", i%10),
	}
}

func GenerateMessages(count int) []LogMessage {
	messages := make([]LogMessage, count)
	for i := 0; i < count; i++ {
		messages[i] = GenerateLogMessage(i)
	}
	return messages
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func GenerateSerializedMessages(count int) [][]byte {
    serializedMessages := make([][]byte, count)
    logLevels := []string{"INFO", "WARN", "ERROR", "DEBUG"}
    
    for i := 0; i < count; i++ {
        // Create the standard log message using your existing format
        msg := LogMessage{
            Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
            Level:      logLevels[rand.Intn(len(logLevels))],
            Message:    fmt.Sprintf("Test log message %d", i),
            ResourceID: fmt.Sprintf("resource-%d", i%10),
        }
        
        data, err := json.Marshal(msg)
        if err != nil {
            data = []byte("{}")
        }
        
        serializedMessages[i] = data
    }
    
    return serializedMessages
}

func main() {
	numCPU := runtime.NumCPU()
	fmt.Println("No of CPU cores",numCPU)
    runtime.GOMAXPROCS(numCPU)
	brokers := flag.String("brokers", "localhost:29092,localhost:39092", "Kafka brokers")
	topic := flag.String("topic", "logs", "Kafka topic name")
	numMessages := flag.Int("messages", 10000000, "Number of messages to send")
	numGoroutines := flag.Int("goroutines", 10, "Number of goroutines")
	flag.Parse()

	brokersList := strings.Split(*brokers, ",")

	fmt.Printf("Starting Kafka producer with %d goroutines to send %d messages\n", *numGoroutines, *numMessages)
	fmt.Printf("Connecting to Kafka at %v, topic: %s\n", brokersList, *topic)

	producer := NewKafkaMessageProducer(brokersList, *topic)
	ctx := context.Background()

	messages := GenerateSerializedMessages(*numMessages)

	defer producer.Close()
	producer.SendMessagesParallel(ctx, messages, *numGoroutines)
}