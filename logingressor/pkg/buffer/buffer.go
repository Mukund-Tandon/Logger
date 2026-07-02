package buffer

import (
	"logingrestor/pkg/models"
	"time"
)

func LogBuffer( logBatchOutputChannel chan models.Logbatch) chan models.Log {
	logChannel := make(chan models.Log)
	buffer := make([]models.Log, 0, 600000)
	ticker := time.NewTicker(15 * time.Second)

	go func() {
		for {
			select {
			case log := <-logChannel:
				buffer = append(buffer, log)
				if len(buffer) >= 600000 {
					logBatchOutputChannel <- models.Logbatch{Logbatch: buffer}
					buffer = buffer[:0] 
				}
			case <-ticker.C:
				if len(buffer) > 0 {
					logBatchOutputChannel <- models.Logbatch{Logbatch: buffer}
					buffer = buffer[:0] // Clear the buffer
				}
				ticker.Reset(15 * time.Second)
			}
		}
	}()

	return logChannel
}