package output

import (
	"context"
	"fmt"
	"logingrestor/pkg/models"
	"logingrestor/pkg/metrics"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

func Output(metricsLogger *metrics.MetricsLogger) (chan models.Logbatch, error) {
	conn, err := getConnection()
	if err != nil {
		fmt.Println("Databae connection failed")
		return nil, err
	}
	fmt.Println(conn)
	logbatchChannel := make(chan models.Logbatch)
	go func() {
		for {
			select {
			case logbatch := <-logbatchChannel:
                err := doBatchInsert(logbatch, conn)
                if err == nil && metricsLogger != nil {
                    metricsLogger.RecordDBInsertion(len(logbatch.Logbatch))
                } else if err != nil {
                    fmt.Printf("Error inserting batch: %v\n", err)
                }
			}
		}
	}()

	return logbatchChannel, nil

}

func doBatchInsert(logbatch models.Logbatch, conn clickhouse.Conn) error {
	ctx := context.Background()
	batch, err := conn.PrepareBatch(ctx, "INSERT INTO logs")
	if err != nil {
		fmt.Println("Error preparing batch:", err)
		return err
	}

	logBatchSize := len(logbatch.Logbatch)
	for i := 0; i < logBatchSize; i++ {
		timestampStr := logbatch.Logbatch[i].Timestamp
		
		timestamp, err := time.Parse(time.RFC3339Nano, timestampStr)
		if err != nil {
			fmt.Printf("Error parsing timestamp %s: %v\n", timestampStr, err)
			continue 
		}
		
		clickHouseInsertFormat := timestamp.Format("2006-01-02 15:04:05.000000")

		message := logbatch.Logbatch[i].Message
		level := logbatch.Logbatch[i].Level
		resourceID := logbatch.Logbatch[i].ResourceID

		err = batch.Append(
			clickHouseInsertFormat,
			message,
			level,
			resourceID,
		)
		if err != nil {
			fmt.Println("Error executing query:", err)
			return  err// Stop execution on query error
		}
	}
	err = batch.Send()
	if err != nil {
		fmt.Println("Error sending batch:", err)
		return err
	}
	return nil
}


