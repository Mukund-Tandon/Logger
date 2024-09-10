package metrics

import (
	"fmt"
	"os"
	"sync"
	"time"
)

type MetricsLogger struct {
	totalInserted int64
	prevInserted  int64
	
	lastLogTime   time.Time
	
	logFile       *os.File
	
	mu            sync.Mutex
}

func NewMetricsLogger(logFilePath string) (*MetricsLogger, error) {
	file, err := os.OpenFile(logFilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open metrics log file: %w", err)
	}
	
	fileInfo, err := file.Stat()
	if err == nil && fileInfo.Size() == 0 {
		headerLine := "timestamp,logs_per_second,total_logs_inserted\n"
		if _, err := file.WriteString(headerLine); err != nil {
			return nil, fmt.Errorf("failed to write header to metrics log file: %w", err)
		}
	}
	
	return &MetricsLogger{
		lastLogTime: time.Now(),
		logFile:     file,
	}, nil
}

func (m *MetricsLogger) RecordDBInsertion(count int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	m.totalInserted += int64(count)
}


func (m *MetricsLogger) LogInsertionRate() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	now := time.Now()
	timeSinceLast := now.Sub(m.lastLogTime).Seconds()
	insertedSinceLast := m.totalInserted - m.prevInserted
	

	insertionRate := float64(insertedSinceLast) / timeSinceLast
	

	logLine := fmt.Sprintf("%s,%.2f,%d\n", 
		now.Format(time.RFC3339),
		insertionRate,
		m.totalInserted)
	

	if _, err := m.logFile.WriteString(logLine); err != nil {
		return fmt.Errorf("failed to write to metrics log file: %w", err)
	}
	
	m.lastLogTime = now
	m.prevInserted = m.totalInserted
	
	return nil
}

func (m *MetricsLogger) StartPeriodicLogging(interval time.Duration) {
	ticker := time.NewTicker(interval)
	
	go func() {
		for range ticker.C {
			if err := m.LogInsertionRate(); err != nil {
				fmt.Fprintf(os.Stderr, "Error logging metrics: %v\n", err)
			}
		}
	}()
}

func (m *MetricsLogger) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	if m.logFile != nil {
		return m.logFile.Close()
	}
	return nil
}