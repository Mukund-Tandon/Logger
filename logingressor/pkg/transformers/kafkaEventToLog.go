package transformer

import (
	"encoding/json"
	"logingrestor/pkg/models"

	"github.com/segmentio/kafka-go"
)

func KafkaEventToLog(msg kafka.Message) (models.Log, error) {
	var log models.Log

	err := json.Unmarshal(msg.Value, &log)
	if err != nil {
		return models.Log{}, err
	}

	return log, nil
}
