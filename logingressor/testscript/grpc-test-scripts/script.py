import grpc
import time
import random
import datetime
from concurrent.futures import ThreadPoolExecutor

import log_service_pb2
import log_service_pb2_grpc

server_address = "127.0.0.1:50051"

levels = ["info", "error", "warning"]
resource_ids = ["server-1234", "server-1235", "server-1236"]
messages = ["Test Message 1", "Test Message 2", "Test Message 3"]

def get_log_data():
    return {
        "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "level": random.choice(levels),
        "message": random.choice(messages),
        "resource_id": random.choice(resource_ids)
    }

def send_log(stub, log_data):
    try:
        # Create a log request from the data
        request = log_service_pb2.LogRequest(
            timestamp=log_data["timestamp"],
            level=log_data["level"],
            message=log_data["message"],
            resource_id=log_data["resource_id"]
        )
        
        # Send the request
        response = stub.SendLog(request)
        return response
    except grpc.RpcError as e:
        print(f"RPC error: {e.code()}: {e.details()}")
        return None

def main():
    channel = grpc.insecure_channel(server_address)
    stub = log_service_pb2_grpc.LogServiceStub(channel)
    start_time = time.time()
    
    print(f"Sending individual logs to {server_address}...")
    
    for i in range(100):
        log_data = get_log_data()
        response = send_log(stub, log_data)
        if response:
            print(f"Individual log {i + 1} sent. Response: {response.success}, Message: {response.message}")
        time.sleep(0.1)  # Small delay between requests
    
    end_time = time.time()  # Record the end time
    print(f"\nAll requests have been sent.")
    print(f"Time taken: {end_time - start_time:.2f} seconds")
    
    channel.close()

if __name__ == "__main__":
    main()