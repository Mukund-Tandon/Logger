package collectors

import (
    "context"
    "fmt"
    "logingrestor/pkg/models"
    transformer "logingrestor/pkg/transformers"
    "os"
    "os/signal"
    "strconv"
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
    numWorkers       int
    readers          []*kafka.Reader
    ctx              context.Context
    cancel           context.CancelFunc
    wg               sync.WaitGroup
}

func NewKafkaCollector(brokers []string, topic, groupID string, logbufferChannel chan models.Log, numWorkers int) *KafkaCollector {

   
    return &KafkaCollector{
        brokers:          brokers,
        topic:            topic,
        groupID:          groupID,
        numWorkers:       numWorkers,
        logbufferChannel: logbufferChannel,
        readers:          make([]*kafka.Reader, numWorkers),
    }
}

func (c *KafkaCollector) Start() error {
    fmt.Printf("Starting Kafka Collector with brokers: %v\n", c.brokers)
    fmt.Printf("Topic: %s\n", c.topic)
    fmt.Printf("GroupID: %s\n", c.groupID)
    fmt.Printf("Number of worker goroutines: %d\n", c.numWorkers)


    fmt.Println("Creating context for Kafka collector")
    if c.ctx == nil {
        c.ctx, c.cancel = context.WithCancel(context.Background())
        fmt.Println("Context created successfully")
    } else {
        fmt.Println("Warning: Context already exists")
    }

    signals := make(chan os.Signal, 1)
    signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)


    readerConfig := kafka.ReaderConfig{
        Brokers:         c.brokers,
        Topic:           c.topic,
        GroupID:         c.groupID,
        MinBytes:        10e3,        
        MaxBytes:        8e6, 
        MaxWait:         1 * time.Second,
        StartOffset:     kafka.FirstOffset,
        ReadLagInterval: -1,
        CommitInterval: 1 * time.Second,
    }

    for i := 0; i < c.numWorkers; i++ {
        workerID := strconv.Itoa(i)
  
        reader := kafka.NewReader(readerConfig)
        c.readers[i] = reader
        
        fmt.Printf("Starting worker goroutine %s\n", workerID)
        c.wg.Add(1)
        
        go func(r *kafka.Reader, id string) {
            defer c.wg.Done()
            c.consumeMessages(r, id)
        }(reader, workerID)
    }

    go func() {
        <-signals
        fmt.Println("Received shutdown signal")
        c.Stop()
    }()

    fmt.Println("Kafka Collector started successfully")
    return nil
}

func (c *KafkaCollector) consumeMessages(reader *kafka.Reader, workerID string) {
    fmt.Printf("Worker %s: Starting message consumption\n", workerID)

    defer func() {
        fmt.Printf("Worker %s: Closing Kafka reader\n", workerID)
        reader.Close()
    }()

    for {
        select {
        case <-c.ctx.Done():
            fmt.Printf("Worker %s: Context canceled, stopping\n", workerID)
            return
        default:
            message, err := reader.ReadMessage(c.ctx)
            if err != nil {
                if err == context.Canceled {
                    fmt.Printf("Worker %s: Context canceled while reading message\n", workerID)
                    return
                }
                fmt.Printf("Worker %s: Error reading Kafka message: %v\n", workerID, err)
                time.Sleep(500 * time.Millisecond) // Brief pause before retrying
                continue
            }

            log, err := transformer.KafkaEventToLog(message)
            if err != nil {
                fmt.Printf("Worker %s: Error transforming Kafka message: %v\n", workerID, err)
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

    fmt.Println("Waiting for all workers to finish")
    c.wg.Wait()

    fmt.Println("Kafka Collector stopped")
}