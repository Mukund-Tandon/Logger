package main

import (
	// "crypto/tls"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	// "logingrestor/pkg/collectors"
	"logingrestor/pkg/buffer"
	"logingrestor/pkg/collectors"
	"logingrestor/pkg/metrics"
	"logingrestor/pkg/output"
)

func main() {

	fmt.Println("Starting")
	metricsLogPath := getEnvOrDefault("METRICS_LOG_FILE", "metrics.csv")
    
    ensureDirectoryExists(metricsLogPath)
    
    metricsLogger, err := metrics.NewMetricsLogger(metricsLogPath)
    if err != nil {
        fmt.Printf("Failed to initialize metrics logger: %v\n", err)
        os.Exit(1)
    }
    defer metricsLogger.Close()
    
    loggingInterval := 5 * time.Second
    metricsLogger.StartPeriodicLogging(loggingInterval)
	logBatchOutputChannel, err := output.Output(metricsLogger)
	if err != nil {
		fmt.Println(err)
	}
	logChannel := buffer.LogBuffer(logBatchOutputChannel, metricsLogger)
	fmt.Println(logChannel)

	var wg sync.WaitGroup

	// Create collectors
	fmt.Println("Creating Http collector...")
	httpCollector := collectors.NewHTTPCollector(logChannel)
	fmt.Println("Http collector created")

	fmt.Println("Creating Kafka collector...")
	kafkaCollector := collectors.NewKafkaCollector(
		logChannel,
		[]string{"kafka-1:9092", "kafka-2:9092"}, // Match your broker ports
		"logs",
		"logs-processor",
		metricsLogger,
	)
	fmt.Println("Kafka collector created")

	fmt.Println("Creating gRPC collector...")
	grpcCollector := collectors.NewGrpcCollector(logChannel, "50051") // Using port 50051 for gRPC
	fmt.Println("gRPC collector created")

	// Start collectors
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