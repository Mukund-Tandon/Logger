package transformer

import (
	"errors"
	"logingrestor/pkg/models"
	pb "logingrestor/logingrestor/pkg/proto"
	"time"
)

func GrpcToLog(req *pb.LogRequest) (models.Log, error) {
	if req == nil {
		return models.Log{}, errors.New("received nil log request")
	}

	if req.Message == "" {
		return models.Log{}, errors.New("log message cannot be empty")
	}

	timestamp := req.Timestamp
	if timestamp == "" {
		timestamp = time.Now().Format(time.RFC3339)
	}

	log := models.Log{
		Level:      req.Level,
		Message:    req.Message,
		ResourceID: req.ResourceId,
		Timestamp:  timestamp,
	}

	return log, nil
}