package collectors

import (
	"fmt"
	"logingrestor/pkg/models"
	"logingrestor/pkg/transformers"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HttpCollector struct{
	logbufferChannel chan models.Log
}
func NewHTTPCollector(logbufferChannel chan models.Log) *HttpCollector {
	return &HttpCollector{
		logbufferChannel: logbufferChannel,
	}
}

func (c *HttpCollector) Start() error {
	fmt.Println("Starting HTTP Collector")
    
	router := gin.Default()
	router.POST("/log", c.handleLogs)

	err := router.Run("0.0.0.0:8080")
	if err != nil {
		fmt.Println("Error starting HTTP server:", err)
		return err
	}

	return nil
}
func (c *HttpCollector) Stop() {
	fmt.Println("Stopped HTTP Collector")
} 
func (c *HttpCollector) handleLogs(ctx *gin.Context) {
	log, err := transformer.HttpToLog(ctx)
	if err != nil {
		ctx.AbortWithError(http.StatusBadRequest, err)
		return
	}

	c.logbufferChannel <- log

	ctx.Status(http.StatusOK)
}

