import time
import random
import datetime
from concurrent.futures import ThreadPoolExecutor
import grpc
import sys
import os

# Add the proto-generated directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the generated gRPC code
from pkg.proto import log_pb2
from pkg.proto import log_pb2_grpc

# Variables for random data generation
level = ["info", "error", "warning"]
resourceID = ["server-1234", "server-1235", "server-1236"]
Message = ["Test Message 1", "Test Message 2", "Test Message 3"]

def send_grpc_log(stub, log_data):
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
        print(f"RPC failed: {e}")

def get_data():
    return {
        "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "level": random.choice(level),
        "message": random.choice(Message),
        "resourceID": random.choice(resourceID)
    }

def main():
    # Create a gRPC channel
    channel = grpc.insecure_channel('localhost:50051')  # Update with your gRPC server address
    
    # Create a stub (client)
    stub = log_pb2_grpc.LogServiceStub(channel)
    
    start_time = time.time()  # Record the start time
    
    # Send logs
    for i in range(1000):
        log_data = get_data()
        response = send_grpc_log(stub, log_data)
        print(f"Log {i + 1} sent.")
        time.sleep(0.4)
    
    print("All logs have been sent.")
    end_time = time.time()  # Record the end time
    print(f"Time taken: {end_time - start_time} seconds")
    
    # Close the channel
    channel.close()

if __name__ == "__main__":
    main()
