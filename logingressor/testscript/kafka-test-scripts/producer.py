
from kafka import KafkaProducer
from kafka.errors import KafkaError
import json
import time
import datetime
import random
import threading

class KafkaMessageProducer:
    def __init__(self, bootstrap_servers, topic_name):
        self.topic_name = topic_name
        self.producer = KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            key_serializer=lambda k: k.encode('utf-8') if k else None,
            acks=1,
            retries=3,
            max_in_flight_requests_per_connection=20,
            linger_ms=50, 
            batch_size=256 * 1024, 
            compression_type='snappy'
        )
        # Metrics
        self.metrics = {
            "sent_count": 0,
            "error_count": 0,
            "start_time": None,
            "end_time": None
        }
        self.metrics_lock = threading.Lock()

    def send_message(self, message):
        self.producer.send(self.topic_name, value=message)
        try:
            with self.metrics_lock:
                self.metrics["sent_count"] += 1
            return True
        except KafkaError as e:
            with self.metrics_lock:
                self.metrics["error_count"] += 1
            return False

    def send_messages_in_thread(self, messages, thread_id):
        for i, msg in enumerate(messages):
            success = self.send_message(msg)

    def send_messages_threaded(self, messages, num_threads=10):
        self.metrics["start_time"] = time.time()
        
        msgs_per_thread = len(messages) // num_threads
        if msgs_per_thread == 0:
            msgs_per_thread = 1
            num_threads = min(num_threads, len(messages))
        
        threads = []
        for i in range(num_threads):
            start_idx = i * msgs_per_thread
            end_idx = start_idx + msgs_per_thread if i < num_threads - 1 else len(messages)
            thread_messages = messages[start_idx:end_idx]
            
            thread = threading.Thread(
                target=self.send_messages_in_thread,
                args=(thread_messages, i)
            )
            threads.append(thread)
            thread.start()
        
        for thread in threads:
            thread.join()
        
        self.metrics["end_time"] = time.time()
        duration = self.metrics["end_time"] - self.metrics["start_time"]
        rate = self.metrics["sent_count"] / duration if duration > 0 else 0
        
        print(f"Completed sending {self.metrics['sent_count']} messages in {duration:.2f} seconds")
        print(f"Throughput: {rate:.2f} messages/second")
        print(f"Errors: {self.metrics['error_count']}")
        
        return {
            "messages_sent": self.metrics["sent_count"],
            "errors": self.metrics["error_count"],
            "duration_seconds": duration,
            "throughput": rate
        }

    def close(self):
        self.producer.close()

def generate_log_message(i):
    log_levels = ["INFO", "WARN", "ERROR", "DEBUG"]
    return {
        'Timestamp': datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        'Level': random.choice(log_levels),
        'Message': f'Test log message {i}',
        'ResourceID': f'resource-{i % 10}'  # Using modulo to repeat some resource IDs
    }

def generate_messages(count):
    return [generate_log_message(i) for i in range(count)]

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Kafka log producer')
    parser.add_argument('--brokers', default='localhost:29092,localhost:39092', help='Kafka brokers')
    parser.add_argument('--topic', default='logs', help='Kafka topic name')
    parser.add_argument('--messages', type=int, default=100000, help='Number of messages to send')
    parser.add_argument('--threads', type=int, default=25, help='Number of threads')
    
    args = parser.parse_args()
    
    bootstrap_servers = args.brokers.split(',')
    topic_name = args.topic
    num_messages = args.messages
    num_threads = args.threads
    
    print(f"Starting Kafka producer with {num_threads} threads to send {num_messages} messages")
    print(f"Connecting to Kafka at {bootstrap_servers}, topic: {topic_name}")
    
    producer = KafkaMessageProducer(bootstrap_servers, topic_name)
    
    try:
        messages = generate_messages(num_messages)
        producer.send_messages_threaded(messages, num_threads=num_threads)
        
    except KeyboardInterrupt:
        print("Interrupted by user, shutting down...")
    finally:
        producer.close()