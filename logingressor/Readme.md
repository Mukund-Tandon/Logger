# LogIngestor

**LogIngestor** is a critical component of a comprehensive logging setup designed to efficiently receive, collect, and store logs from various sources into a database. The primary focus of LogIngestor is on performance and reliability, ensuring that logs are processed and stored quickly and efficiently.

## Overview

LogIngestor is designed to handle logs from multiple sources simultaneously. It supports different types of log collectors, including:

- **HTTP Requests** (Working)
- **Kafka Streams** (WIP)
- **gRPC Requests** (WIP)

### How It Works

1. **Log Collection:**
   - LogIngestor accepts incoming log data from different collectors.
   - Each collector is capable of receiving logs via HTTP requests, Kafka, or gRPC.

2. **Buffering for Efficiency:**
   - Logs received are temporarily stored in a common buffer.
   - To enhance efficiency, logs are batched together before being sent to the database. 
   - The system waits until either 100 logs are collected or 5 seconds have passed, whichever occurs first. At that point, the batch is inserted into the database.

3. **Parallel Processing with Goroutines:**
   - Each collector, along with the buffering and output functions, operates in its own goroutine.
   - This design maximizes performance by allowing parallel processing of log data.

4. **Future Enhancements:**
   - A planned feature will allow logs to be stored in different data sources based on predefined rules.

### Architecture Diagram

The architecture diagram illustrates how LogIngestor interacts with various collectors, processes log data through the buffer, and inserts it into the database.

<img width="627" alt="image" src="https://github.com/user-attachments/assets/700e3692-518a-4bff-ae63-c946659459a2">



