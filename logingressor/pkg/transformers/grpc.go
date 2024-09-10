package transformer

import (
	"logingrestor/pkg/models"
	pb "logingrestor/logingrestor/pkg/proto"
)


func GrpcToLog(req *pb.LogRequest) (models.Log, error) {
	log := models.Log{
		Level:      req.Level,
		Message:    req.Message,
		ResourceID: req.ResourceID,
		Timestamp:  req.Timestamp,
	}

	return log, nil
}
