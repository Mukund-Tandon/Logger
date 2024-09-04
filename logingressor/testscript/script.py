import requests
import json
import time
import random
import datetime
from concurrent.futures import ThreadPoolExecutor

url = "http://127.0.0.1:8080/log"
data = {
  "timestamp": "2023-05-18T15:23:42Z",
  "level": "error",
  "message": "Lol",
  "resourceID": "server-1234"
}

headers = {
    "Content-Type": "application/json"
}
level = ["info", "error", "warning"]
resourceID = ["server-1234", "server-1235", "server-1236"]
Message =["Test Message 1", "Test Message 2", "Test Message 3"]
def send_post_request(url, data, headers):
    try:
        requests.post(url, data=json.dumps(data), headers=headers)
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")

def getData():
    return {
        "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "level": random.choice(level),
        "message": random.choice(Message),
        "resourceID": random.choice(resourceID)
    }
def main():
    start_time = time.time()  # Record the start time
    # with ThreadPoolExecutor(max_workers=50) as executor:
    for i in range(1000):
        data = getData()
        send_post_request(url, data, headers)
        print(f"Request {i + 1} sent.")
        time.sleep(0.4)
    print("All requests have been sent.")
    end_time = time.time()  # Record the end time
    print(f"Time taken: {end_time - start_time} seconds")

if __name__ == "__main__":
    main()
