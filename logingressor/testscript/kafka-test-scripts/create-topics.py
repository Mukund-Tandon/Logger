from kafka import KafkaAdminClient
from kafka.admin import NewTopic
import time

def create_topic(bootstrap_servers, topic_name, num_partitions=3, replication_factor=3):
    admin_client = KafkaAdminClient(
        bootstrap_servers=bootstrap_servers,
        client_id='kafka-topic-management'
    )

    topic_list = []
    topic_list.append(NewTopic(name=topic_name, num_partitions=num_partitions, replication_factor=replication_factor))
    
    try:
        admin_client.create_topics(new_topics=topic_list, validate_only=False)
        print(f"Topic '{topic_name}' created successfully.")
    except Exception as e:
        print(f"Failed to create topic '{topic_name}': {e}")
    finally:
        admin_client.close()

if __name__ == "__main__":
    # Updated bootstrap servers to match Docker exposed ports
    bootstrap_servers = ['localhost:9093', 'localhost:9094', 'localhost:9095']
    topic_name = 'logs'
    
    # Add error handling and connection retry
    max_retries = 3
    retry_delay = 5  # seconds
    
    for attempt in range(max_retries):
        try:
            create_topic(bootstrap_servers, topic_name)
            break
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"Attempt {attempt + 1} failed. Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                print(f"Failed after {max_retries} attempts: {e}")