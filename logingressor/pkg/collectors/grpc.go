package collectors

import (
	"context"
	"fmt"
	"logingrestor/pkg/models"
	"logingrestor/pkg/transformers"
	"net"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
	pb "logingrestor/logingrestor/pkg/proto"
)

type GrpcCollector struct {
	logbufferChannel chan models.Log
	port             string
	server           *grpc.Server
}


func NewGrpcCollector(logbufferChannel chan models.Log, port string) *GrpcCollector {
	return &GrpcCollector{
		logbufferChannel: logbufferChannel,
		port:             port,
	}
}


func (c *GrpcCollector) Start() error {
	fmt.Println("Starting gRPC Collector on port", c.port)

	listener, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%s", c.port))
	if err != nil {
		fmt.Println("Failed to listen:", err)
		return err
	}

	c.server = grpc.NewServer(
		grpc.MaxConcurrentStreams(100),
		grpc.MaxRecvMsgSize(4 * 1024 * 1024),
	)
	
	logService := &LogService{logbufferChannel: c.logbufferChannel}
	pb.RegisterLogServiceServer(c.server, logService)
	reflection.Register(c.server)

	fmt.Println("gRPC server starting on", listener.Addr())
	

	if err := c.server.Serve(listener); err != nil {
		fmt.Println("gRPC server stopped:", err)
		return err
	}

	return nil
}


func (c *GrpcCollector) Stop() {
	fmt.Println("Stopping gRPC Collector")
	if c.server != nil {
		done := make(chan struct{})
		go func() {
			c.server.GracefulStop()
			close(done)
		}()

		select {
		case <-done:
			fmt.Println("gRPC server stopped gracefully")
		case <-time.After(10 * time.Second):
			fmt.Println("gRPC server shutdown timed out, forcing stop")
			c.server.Stop()
		}
	}
	fmt.Println("Stopped gRPC Collector")
}

type LogService struct {
	pb.UnimplementedLogServiceServer
	logbufferChannel chan models.Log
}

func (s *LogService) SendLog(ctx context.Context, req *pb.LogRequest) (*pb.LogResponse, error) {
	log, err := transformer.GrpcToLog(req)
	if err != nil {
		return &pb.LogResponse{Success: false, Message: err.Error()}, err
	}

	s.logbufferChannel <- log

	return &pb.LogResponse{Success: true, Message: "Log received successfully"}, nil
}

