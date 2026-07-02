package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"logingrestor/pkg/buffer"
	"logingrestor/pkg/collectors"
	"logingrestor/pkg/metrics"
	"logingrestor/pkg/output"
)

func main() {
	numCPU := runtime.NumCPU()
    runtime.GOMAXPROCS(numCPU)

	fmt.Println("Starting")
	kafkaWorkers := 10
	dbWorkers := 10
	metricsLogPath := getEnvOrDefault("METRICS_LOG_FILE", "metrics.csv")

	ensureDirectoryExists(metricsLogPath)

	metricsLogger, err := metrics.NewMetricsLogger(metricsLogPath)
	if err != nil {
		fmt.Printf("Failed to initialize metrics logger: %v\n", err)
		os.Exit(1)
	}
	defer metricsLogger.Close()

	loggingInterval := 1 * time.Second
	metricsLogger.StartPeriodicLogging(loggingInterval)
	logBatchOutputChannel, err := output.Output(dbWorkers, metricsLogger)
	if err != nil {
		fmt.Println(err)
	}
	logChannel := buffer.LogBuffer(logBatchOutputChannel)
	fmt.Println(logChannel)

	var wg sync.WaitGroup

	fmt.Println("Creating Http collector...")
	httpCollector := collectors.NewHTTPCollector(logChannel)
	fmt.Println("Http collector created")

	fmt.Println("Creating Kafka collector...")

	fmt.Printf("Using %d Kafka workers and %d database workers\n", kafkaWorkers, dbWorkers)

	kafkaTopic := getEnvOrDefault("KAFKA_TOPIC", "logs")
	kafkaGroupID := getEnvOrDefault("KAFKA_GROUP_ID", "log-ingestor")
	kafkaCollector := collectors.NewKafkaCollector(
		[]string{"kafka-1:9092", "kafka-2:9092"},
		kafkaTopic,
		kafkaGroupID,
		logChannel,
		kafkaWorkers,
	)
	fmt.Println("Kafka collector created")

	fmt.Println("Creating gRPC collector...")
	grpcCollector := collectors.NewGrpcCollector(logChannel, "50051") // Using port 50051 for gRPC
	fmt.Println("gRPC collector created")

	wg.Add(3)

	go func() {
		defer wg.Done()
		err := httpCollector.Start()
		if err != nil {
			fmt.Println("Error starting HTTP collector:", err)
		}
	}()

	go func() {
		defer wg.Done()
		fmt.Println("Starting Kafka collector...")
		err := kafkaCollector.Start()
		if err != nil {
			fmt.Println("Error starting Kafka collector:", err)
		}
	}()

	go func() {
		defer wg.Done()
		fmt.Println("Starting gRPC collector...")
		err := grpcCollector.Start()
		if err != nil {
			fmt.Println("Error starting gRPC collector:", err)
		}
	}()

	wg.Wait()
}

func getEnvOrDefault(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func ensureDirectoryExists(filePath string) {
	dir := filepath.Dir(filePath)
	if dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			fmt.Printf("Warning: Failed to create directory for metrics log: %v\n", err)
		}
	}
}
