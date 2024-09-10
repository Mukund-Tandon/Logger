from kafka import KafkaConsumer
from kafka.errors import KafkaError
import json

class KafkaMessageConsumer:
    def __init__(self, bootstrap_servers, topic_name, group_id):
        self.consumer = KafkaConsumer(
            topic_name,
            bootstrap_servers=bootstrap_servers,
            auto_offset_reset='earliest',
            enable_auto_commit=True,
            group_id=group_id,
            value_deserializer=lambda x: json.loads(x.decode('utf-8')),
            key_deserializer=lambda x: x.decode('utf-8') if x else None  # Added key deserializer
        )

    def consume_messages(self):
        try:
            for message in self.consumer:
                print(f"\nReceived message:")
                print(f"Key: {message.key}")
                print(f"Value: {message.value}")
                print(f"Topic: {message.topic}")
                print(f"Partition: {message.partition}")
                print(f"Offset: {message.offset}")
                print(f"Timestamp: {message.timestamp}")
                print("-" * 50)
        except KafkaError as e:
            print(f"Consumer error: {e}")
        except KeyboardInterrupt:
            print("\nConsumer stopped by user")
        finally:
            self.close()

    def close(self):
        self.consumer.close()

if __name__ == "__main__":
    # Fixed ports to match Docker Compose
    bootstrap_servers = ['localhost:29092', 'localhost:39092']
    topic_name = 'logs'
    group_id = 'logs-group-1'
    
    consumer = KafkaMessageConsumer(bootstrap_servers, topic_name, group_id)
    print(f"Consuming messages from topic '{topic_name}'. Press Ctrl+C to exit...")
    consumer.consume_messages()