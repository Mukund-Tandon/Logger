#!/usr/bin/env python3
import time
import random
import datetime
import sys
import os
from concurrent.futures import ThreadPoolExecutor

# For gRPC
import grpcio

# Add appropriate paths for importing the generated proto files
# Assuming your proto-generated files are in a specific location
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(script_dir)
sys.path.append(parent_dir)

# Import the generated proto files
# These will be generated from your log.proto file
try:
    from pkg.proto import log_pb2, log_pb2_grpc
except ImportError:
    print("Error importing proto modules. Make sure you've generated them with:")
    print("protoc --go_out=. --go-grpc_out=. pkg/proto/log.proto")
    print("protoc --python_out=. --grpc_python_out=. pkg/proto/log.proto")
    sys.exit(1)

# Configuration
NUM_LOGS = 100  # Number of logs to send
SEND_INTERVAL = 0.1  # Time between each log in seconds
SERVER_ADDRESS = 'localhost:50051'  # gRPC server address

# Sample data for random generation
log_levels = ["INFO", "WARN", "ERROR", "DEBUG"]
resource_ids = ["resource-0", "resource-1", "resource-2", "server-1234", "database-5678"]
messages = [
    "User login successful",
    "Failed to connect to database",
    "API request processed",
    "Cache invalidated",
    "Memory usage high",
    "CPU utilization spike detected",
    "Network latency increased",
    "Batch process completed"
]

def generate_log_data():
    """Generate random log data"""
    return {
        "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "level": random.choice(log_levels),
        "message": f"{random.choice(messages)} - ID: {random.randint(1000, 9999)}",
        "resourceID": random.choice(resource_ids)
    }

def send_log(stub, log_data):
    """Send a single log via gRPC"""
    try:
        # Create a LogRequest object
        request = log_pb2.LogRequest(
            timestamp=log_data["timestamp"],
            level=log_data["level"],
            message=log_data["message"],
            resourceID=log_data["resourceID"]
        )
        
        # Send the log via gRPC
        response = stub.SendLog(request)
        return response
    except grpc.RpcError as e:
        print(f"RPC failed: {e.code().name} - {e.details()}")
        return None

def send_logs_sequential(stub, num_logs):
    """Send logs sequentially"""
    successful = 0
    failed = 0
    
    for i in range(num_logs):
        log_data = generate_log_data()
        response = send_log(stub, log_data)
        
        if response and response.success:
            successful += 1
            print(f"Log {i+1}/{num_logs} sent successfully: {log_data['message']}")
        else:
            failed += 1
            print(f"Log {i+1}/{num_logs} failed to send")
            
        time.sleep(SEND_INTERVAL)
    
    return successful, failed

def send_logs_parallel(stub, num_logs, max_workers=10):
    """Send logs in parallel using ThreadPoolExecutor"""
    successful = 0
    failed = 0
    log_data_list = [generate_log_data() for _ in range(num_logs)]
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(send_log, stub, log_data) for log_data in log_data_list]
        
        for i, future in enumerate(futures):
            try:
                response = future.result()
                if response and response.success:
                    successful += 1
                    print(f"Log {i+1}/{num_logs} sent successfully")
                else:
                    failed += 1
                    print(f"Log {i+1}/{num_logs} failed to send")
            except Exception as e:
                failed += 1
                print(f"Log {i+1}/{num_logs} error: {str(e)}")
    
    return successful, failed

def main():
    print(f"Starting gRPC test client - connecting to {SERVER_ADDRESS}")
    
    # Create a gRPC channel
    with grpc.insecure_channel(SERVER_ADDRESS) as channel:
        # Create a stub (client)
        stub = log_pb2_grpc.LogServiceStub(channel)
        
        # Choose mode (sequential or parallel)
        mode = "sequential"  # Change to "parallel" for parallel sending
        num_logs = NUM_LOGS
        
        start_time = time.time()
        
        if mode == "sequential":
            print(f"Sending {num_logs} logs sequentially...")
            successful, failed = send_logs_sequential(stub, num_logs)
        else:
            print(f"Sending {num_logs} logs in parallel...")
            successful, failed = send_logs_parallel(stub, num_logs)
        
        end_time = time.time()
        duration = end_time - start_time
        
        print("\n--- Results ---")
        print(f"Total logs sent: {num_logs}")
        print(f"Successful: {successful}")
        print(f"Failed: {failed}")
        print(f"Time taken: {duration:.2f} seconds")
        print(f"Throughput: {num_logs / duration:.2f} logs/second")

if __name__ == "__main__":
    main()