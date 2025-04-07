package output

import (
    "context"
    "fmt"
    "logingrestor/pkg/metrics"
    "logingrestor/pkg/models"
    "sync"
    "time"

    "github.com/ClickHouse/clickhouse-go/v2"
)


type Worker struct {
    id            string
    conn          clickhouse.Conn
    inputChannel  chan models.Logbatch
    metricsLogger *metrics.MetricsLogger
    ctx           context.Context
    wg            *sync.WaitGroup
}


type OutputPool struct {
    workers       []*Worker
    inputChannel  chan models.Logbatch
    metricsLogger *metrics.MetricsLogger
    wg            sync.WaitGroup
    ctx           context.Context
    cancel        context.CancelFunc
}

func NewOutputPool(numWorkers int, metricsLogger *metrics.MetricsLogger) (*OutputPool, error) {
    if numWorkers <= 0 {
        numWorkers = 1
    }

    ctx, cancel := context.WithCancel(context.Background())
    
    inputChannel := make(chan models.Logbatch, numWorkers*10) 
    
    pool := &OutputPool{
        workers:       make([]*Worker, numWorkers),
        inputChannel:  inputChannel,
        metricsLogger: metricsLogger,
        ctx:           ctx,
        cancel:        cancel,
    }
    
    fmt.Printf("Creating output pool with %d workers\n", numWorkers)
    
    
    for i := 0; i < numWorkers; i++ {
        worker, err := createWorker(fmt.Sprintf("worker-%d", i), metricsLogger, &pool.wg, ctx)
        if err != nil {
        
            cancel()
            return nil, fmt.Errorf("failed to create worker %d: %w", i, err)
        }
        
        pool.workers[i] = worker
    }
    

    go pool.dispatch()
    
    return pool, nil
}


func createWorker(id string, metricsLogger *metrics.MetricsLogger, wg *sync.WaitGroup, ctx context.Context) (*Worker, error) {

    conn, err := getConnection()
    if err != nil {
        return nil, fmt.Errorf("failed to create database connection for worker %s: %w", id, err)
    }
    
    workerChannel := make(chan models.Logbatch, 10)
    
    worker := &Worker{
        id:            id,
        conn:          conn,
        inputChannel:  workerChannel,
        metricsLogger: metricsLogger,
        ctx:           ctx,
        wg:            wg,
    }

    wg.Add(1)
    go worker.work()
    
    fmt.Printf("Worker %s initialized with dedicated database connection\n", id)
    return worker, nil
}

func (p *OutputPool) dispatch() {
    fmt.Println("Output dispatcher started")
    
    currentWorker := 0
    numWorkers := len(p.workers)
    
    for {
        select {
        case <-p.ctx.Done():
            fmt.Println("Dispatcher shutting down")
            return
            
        case batch := <-p.inputChannel:
            p.workers[currentWorker].inputChannel <- batch
            currentWorker = (currentWorker + 1) % numWorkers
        }
    }
}

func (w *Worker) work() {
    defer w.wg.Done()
    fmt.Printf("Worker %s started processing\n", w.id)
    
    for {
        select {
        case <-w.ctx.Done():
            fmt.Printf("Worker %s shutting down\n", w.id)
            if w.conn != nil {
                w.conn.Close()
            }
            return
            
        case batch := <-w.inputChannel:
            fmt.Printf("Worker %s processing batch of size %d\n", w.id, len(batch.Logbatch))
            
            err := doBatchInsert(batch, w.conn)

            if err == nil && w.metricsLogger != nil {
                w.metricsLogger.RecordDBInsertion(len(batch.Logbatch))
                fmt.Printf("Worker %s recorded insertion of %d logs\n", w.id, len(batch.Logbatch))
            } else if err != nil {
                fmt.Printf("Worker %s error inserting batch: %v\n", w.id, err)
            }
        }
    }
}


func (p *OutputPool) GetInputChannel() chan models.Logbatch {
    return p.inputChannel
}


func (p *OutputPool) Stop() {
    fmt.Println("Stopping output worker pool")
    p.cancel()
    
    fmt.Println("Waiting for all output workers to finish")
    p.wg.Wait()
    
    fmt.Println("Output worker pool stopped")
}


func doBatchInsert(logbatch models.Logbatch, conn clickhouse.Conn) error {
    ctx := context.Background()
    batch, err := conn.PrepareBatch(ctx, "INSERT INTO logs")
    if err != nil {
        fmt.Println("Error preparing batch:", err)
        return err
    }

    logBatchSize := len(logbatch.Logbatch)
    for i := 0; i < logBatchSize; i++ {
        timestampStr := logbatch.Logbatch[i].Timestamp

        timestamp, err := time.Parse(time.RFC3339Nano, timestampStr)
        if err != nil {
            fmt.Printf("Error parsing timestamp %s: %v\n", timestampStr, err)
            continue 
        }

        clickHouseInsertFormat := timestamp.Format("2006-01-02 15:04:05.000000")

        message := logbatch.Logbatch[i].Message
        level := logbatch.Logbatch[i].Level
        resourceID := logbatch.Logbatch[i].ResourceID

        err = batch.Append(
            clickHouseInsertFormat,
            level,
            message,
            resourceID,
        )
        if err != nil {
            fmt.Println("Error executing query:", err)
            return err
        }
    }
    
    err = batch.Send()
    if err != nil {
        fmt.Println("Error sending batch:", err)
        return err
    }
    
    return nil
}

func Output(numWorkers int, metricsLogger *metrics.MetricsLogger) (chan models.Logbatch, error) {
    pool, err := NewOutputPool(numWorkers, metricsLogger)
    if err != nil {
        return nil, err
    }
    
    return pool.GetInputChannel(), nil
}