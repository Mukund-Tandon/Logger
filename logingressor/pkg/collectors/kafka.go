package collectors

import (
	"context"
	"fmt"
	"logingrestor/pkg/models"
	"logingrestor/pkg/metrics"
	transformer "logingrestor/pkg/transformers"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/segmentio/kafka-go"
)

type KafkaCollector struct {
	logbufferChannel chan models.Log
	brokers          []string
	topic            string
	groupID          string
	reader           *kafka.Reader
	ctx              context.Context
	cancel           context.CancelFunc
	wg               sync.WaitGroup
	metricsLogger    *metrics.MetricsLogger
}

func (c *KafkaCollector) Start() error {
	fmt.Println("Starting Kafka Collector with brokers:", c.brokers)
	fmt.Println("Topic:", c.topic)
	fmt.Println("GroupID:", c.groupID)

	fmt.Println("Creating context for Kafka collector")
	if c.ctx == nil {
		c.ctx, c.cancel = context.WithCancel(context.Background())
		fmt.Println("Context created successfully")
	} else {
		fmt.Println("Warning: Context already exists")
	}

	fmt.Println("Configuring Kafka reader")
	c.reader = kafka.NewReader(kafka.ReaderConfig{
		Brokers:         c.brokers,
		Topic:           c.topic,
		GroupID:         c.groupID,
		MinBytes:        10e3, // 10KB
		MaxBytes:        10e6, // 10MB
		MaxWait:         1 * time.Second,
		StartOffset:     kafka.FirstOffset, // equivalent to 'earliest'
		ReadLagInterval: -1,
	})

	if c.reader == nil {
		fmt.Println("ERROR: Failed to create Kafka reader")
		return fmt.Errorf("failed to create Kafka reader")
	}
	fmt.Println("Kafka reader created successfully")

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)

	fmt.Println("Starting message consumer goroutine")
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		fmt.Println("Consumer goroutine started")
		c.consumeMessages()
	}()

	go func() {
		<-signals
		fmt.Println("Received shutdown signal")
		c.Stop()
	}()

	fmt.Println("Kafka Collector started successfully")
	return nil
}

func (c *KafkaCollector) consumeMessages() {
	fmt.Println("Entering consumeMessages method")

	if c.reader == nil {
		fmt.Println("CRITICAL ERROR: Kafka reader is nil in consumeMessages")
		return
	}

	if c.ctx == nil {
		fmt.Println("CRITICAL ERROR: Context is nil in consumeMessages")
		return
	}


	defer c.reader.Close()

	for {
		select {
		case <-c.ctx.Done():
			fmt.Println("Stopping Kafka message consumption")
			return
		default:
			message, err := c.reader.ReadMessage(c.ctx)
			if err != nil {
				if err == context.Canceled {
					fmt.Println("Context canceled, stopping message consumption")
					return
				}
				fmt.Printf("Error reading Kafka message: %v\n", err)
				continue
			}


			log, err := transformer.KafkaEventToLog(message)
			if err != nil {
				fmt.Printf("Error transforming Kafka message: %v\n", err)
				continue
			}
			c.logbufferChannel <- log
		}
	}
}

func (c *KafkaCollector) Stop() {
	fmt.Println("Stopping Kafka Collector")
	if c.cancel != nil {
		c.cancel()
		fmt.Println("Context canceled")
	} else {
		fmt.Println("WARNING: Cancel function is nil")
	}

	fmt.Println("Waiting for goroutines to finish")
	c.wg.Wait() // Wait for all goroutines to finish

	if c.reader != nil {
		fmt.Println("Closing Kafka reader")
		c.reader.Close()
	} else {
		fmt.Println("WARNING: Reader is nil when stopping")
	}
	fmt.Println("Kafka Collector stopped")
}
