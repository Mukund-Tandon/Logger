package collectors

import (
	"context"
	"fmt"
	"logingrestor/pkg/models"
	"logingrestor/pkg/transformers"
	"net"
	"sync"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
	pb "logingrestor/logingrestor/pkg/proto"
)

type GrpcCollector struct {
	logbufferChannel chan models.Log
	server           *grpc.Server
	port             string
	wg               sync.WaitGroup
	cancel           context.CancelFunc
}

func NewGrpcCollector(logbufferChannel chan models.Log, port string) *GrpcCollector {
	return &GrpcCollector{
		logbufferChannel: logbufferChannel,
		port:             port,
	}
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


func (c *GrpcCollector) Start() error {
	fmt.Println("Starting gRPC Collector on port", c.port)

	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel

	listener, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%s", c.port))
	if err != nil {
		fmt.Println("Failed to listen:", err)
		return err
	}

	c.server = grpc.NewServer()
	logService := &LogService{logbufferChannel: c.logbufferChannel}
	pb.RegisterLogServiceServer(c.server, logService)
	reflection.Register(c.server) // for grpcurl and other debugging tools

	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		fmt.Println("gRPC server starting on", listener.Addr())
		if err := c.server.Serve(listener); err != nil {
			select {
			case <-ctx.Done():
				fmt.Println("gRPC server shut down gracefully")
			default:
				fmt.Println("gRPC server stopped unexpectedly:", err)
			}
		}
	}()

	return nil
}

func (c *GrpcCollector) Stop() {
	fmt.Println("Stopping gRPC Collector")
	if c.server != nil {
		c.server.GracefulStop()
	}
	if c.cancel != nil {
		c.cancel()
	}
	c.wg.Wait()
	fmt.Println("gRPC Collector stopped")
} 