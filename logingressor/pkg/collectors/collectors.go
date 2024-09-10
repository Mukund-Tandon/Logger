package collectors

import "logingrestor/pkg/models"
import "logingrestor/pkg/metrics"
type Collector interface {
	Start()
	Stop()
}

func NewHTTPCollector(logbufferChannel chan models.Log) *HttpCollector {
	return &HttpCollector{
		logbufferChannel: logbufferChannel,
	}
}

func NewKafkaCollector(logbufferChannel chan models.Log, brokers []string, topic string, groupID string, metricsLogger *metrics.MetricsLogger) *KafkaCollector {
	return &KafkaCollector{
		logbufferChannel: logbufferChannel,
		brokers:          brokers,
		topic:            topic,
		groupID:          groupID,
		metricsLogger:    metricsLogger,
	}
}
