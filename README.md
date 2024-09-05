# Logger: Centralized Logging Infrastructure with AI-Assisted Querying

Logger is a comprehensive infrastructure for collecting, storing, and analyzing logs from various applications in a centralized location. It offers powerful querying capabilities and an AI-assisted interface for easy log navigation and analysis.

![Logger Architecture](https://github.com/user-attachments/assets/73ddcbb1-d323-44b1-9a17-10d10f8cfe0a)

## Project Components

### 1. SDKs (Work in Progress)

We are developing libraries that can be easily installed and configured to interact with the Log Ingestor. These SDKs will simplify the process of sending logs from your applications to our centralized logging system.

**Features (Planned):**
- Easy integration with popular programming languages
- Configurable log levels and formats

### 2. Log Ingestor

The Log Ingestor is a critical component of our logging infrastructure, designed to efficiently receive, collect, and store logs from various sources into a database. Its primary focus is on performance and reliability, ensuring that logs are processed and stored quickly and efficiently.

**Key Features:**
- High-throughput log ingestion
- Support for multiple input formats (e.g., JSON, plaintext)
- Scalable architecture to handle large volumes of logs
- Data validation and preprocessing

**Log Collection Methods:**
- HTTP Requests (Fully implemented)
- Kafka Streams (Work in Progress)
- gRPC Requests (Work in Progress)

**How It Works:**
1. **Log Collection:** The Log Ingestor accepts incoming log data from different collectors, each capable of receiving logs via HTTP requests, Kafka, or gRPC.
2. **Buffering for Efficiency:** 
   - Received logs are temporarily stored in a common buffer.
   - Logs are batched together before being sent to the database.
   - The system waits until either 100 logs are collected or 5 seconds have passed, whichever occurs first, before inserting the batch into the database.
3. **Parallel Processing:** Each collector, along with the buffering and output functions, operates in its own goroutine, maximizing performance through parallel processing of log data.

**Future Enhancements:**
- Implementation of rules-based log routing to different data sources

**Architecture Diagram:**
![Log Ingestor Architecture](https://github.com/user-attachments/assets/700e3692-518a-4bff-ae63-c946659459a2)

For more details on the Log Ingestor, please refer to our [Log Ingestor Documentation](https://github.com/Mukund-Tandon/Logger/tree/main/logingressor).

### 3. Log Server

The Log Server acts as an intermediary between the stored logs and the user interface. It provides endpoints for querying logs and incorporates an AI-powered interface for natural language log navigation.

**Key Features:**
- RESTful API for log querying
- AI-assisted natural language processing for log analysis
- Advanced filtering and search capabilities
- Real-time log streaming

### 4. Dashboard

The Dashboard offers a visual interface for users to query, view, and analyze logs efficiently.

**Key Features:**
- Intuitive UI for log exploration
- Real-time log monitoring
- Export and sharing capabilities (WIP)

