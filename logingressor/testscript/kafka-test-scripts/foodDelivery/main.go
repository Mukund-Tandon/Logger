// Command foodDelivery generates realistic production-like logs for a food
// delivery platform (Swiggy/Zomato-style) and publishes them to Kafka, from
// where the ingestor writes them into ClickHouse (table `logs`:
// Timestamp, Level, Message, ResourceID).
//
// It models a full order pipeline across many microservices, emitting
// correlated, interleaved log lines (shared trace_id/order_id/user_id) with
// realistic timestamps spread across a time window. Into that steady traffic it
// injects 4 failure scenarios, each confined to a time window with a KNOWN root
// cause and a distinctive, clusterable error template — so an LLM can locate the
// spike, cluster it (find_patterns), correlate the root-cause signal, and
// diagnose it. The ground-truth scenarios are printed at the end for grading.
//
// Conventions match ../producer.go:
//   - message JSON: {Timestamp, Level, Message, ResourceID}
//   - ResourceID   = service name (so RCA can filter by service)
//   - Message      = logfmt "k=v" pairs (LLM-parseable, find_patterns-friendly:
//                    trace ids are UUIDs, order/user ids are numeric → they
//                    normalize to <UUID>/<NUM> so identical events cluster)
//   - Kafka writer = same async/snappy config; brokers default to the exposed
//                    host ports localhost:29092,localhost:39092, topic "logs".
//
// Run (from testscript/kafka-test-scripts):
//   go run ./foodDelivery --orders 40000 --hours 6
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/segmentio/kafka-go"
)

// ---------------------------------------------------------------------------
// Kafka producer (identical config to ../producer.go)
// ---------------------------------------------------------------------------

type LogMessage struct {
	Timestamp  string `json:"Timestamp"`
	Level      string `json:"Level"`
	Message    string `json:"Message"`
	ResourceID string `json:"ResourceID"`
}

type Producer struct {
	writer  *kafka.Writer
	metrics struct {
		sentCount  uint32
		errorCount uint32
	}
}

func NewProducer(brokers []string, topic string) *Producer {
	return &Producer{writer: &kafka.Writer{
		Addr:            kafka.TCP(brokers...),
		Topic:           topic,
		BatchSize:       4000,
		BatchBytes:      128 * 1024,
		BatchTimeout:    50 * time.Millisecond,
		Async:           true,
		RequiredAcks:    kafka.RequireOne,
		Compression:     kafka.Snappy,
		MaxAttempts:     3,
		WriteBackoffMin: 10 * time.Millisecond,
		WriteBackoffMax: 500 * time.Millisecond,
	}}
}

func (p *Producer) send(ctx context.Context, msg []byte) {
	if err := p.writer.WriteMessages(ctx, kafka.Message{Value: msg}); err != nil {
		atomic.AddUint32(&p.metrics.errorCount, 1)
		return
	}
	atomic.AddUint32(&p.metrics.sentCount, 1)
}

func (p *Producer) sendParallel(ctx context.Context, messages [][]byte, workers int) {
	start := time.Now()
	if workers < 1 {
		workers = 1
	}
	per := (len(messages) + workers - 1) / workers
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		lo := w * per
		if lo >= len(messages) {
			break
		}
		hi := lo + per
		if hi > len(messages) {
			hi = len(messages)
		}
		wg.Add(1)
		go func(batch [][]byte) {
			defer wg.Done()
			for _, m := range batch {
				p.send(ctx, m)
			}
		}(messages[lo:hi])
	}
	wg.Wait()
	dur := time.Since(start).Seconds()
	sent := atomic.LoadUint32(&p.metrics.sentCount)
	errs := atomic.LoadUint32(&p.metrics.errorCount)
	fmt.Printf("\nSent %d messages in %.2fs (%.0f msg/s), errors: %d\n", sent, dur, float64(sent)/dur, errs)
}

func (p *Producer) Close() { p.writer.Close() }

// ---------------------------------------------------------------------------
// Log formatting (logfmt)
// ---------------------------------------------------------------------------

type field struct{ k, v string }

func f(k, v string) field { return field{k, v} }
func fi(k string, v int) field { return field{k, fmt.Sprintf("%d", v)} }

// logfmt renders "svc=<svc> event=<event> k=v ..." quoting values with spaces.
func logfmt(svc, event string, fields ...field) string {
	var b strings.Builder
	b.WriteString("svc=")
	b.WriteString(svc)
	b.WriteString(" event=")
	b.WriteString(event)
	for _, fl := range fields {
		v := fl.v
		if strings.ContainsAny(v, " \"") {
			v = "\"" + strings.ReplaceAll(v, "\"", "'") + "\""
		}
		b.WriteString(" ")
		b.WriteString(fl.k)
		b.WriteString("=")
		b.WriteString(v)
	}
	return b.String()
}

// ---------------------------------------------------------------------------
// Services and helpers
// ---------------------------------------------------------------------------

const (
	svcGateway      = "api-gateway"
	svcAuth         = "auth-service"
	svcCart         = "cart-service"
	svcCheckout     = "checkout-service"
	svcInventory    = "inventory-service"
	svcPricing      = "pricing-service"
	svcPayment      = "payment-service"
	svcOrder        = "order-service"
	svcRestaurant   = "restaurant-service"
	svcDelivery     = "delivery-service"
	svcNotification = "notification-service"
)

var allServices = []string{
	svcGateway, svcAuth, svcCart, svcCheckout, svcInventory, svcPricing,
	svcPayment, svcOrder, svcRestaurant, svcDelivery, svcNotification,
}

var cities = []string{"BLR", "DEL", "MUM", "HYD", "PUN", "CHN"}
var restaurants = []string{"R101", "R102", "R103", "R104", "R105", "R106", "R107", "R108"}
var gateways = []string{"razorpay", "payu", "stripe"}
var items = []string{"paneer-tikka", "veg-biryani", "masala-dosa", "butter-naan", "cold-coffee", "gulab-jamun"}

const hexdigits = "0123456789abcdef"

func uuid() string {
	b := make([]byte, 36)
	for i := range b {
		switch i {
		case 8, 13, 18, 23:
			b[i] = '-'
		case 14:
			b[i] = '4'
		default:
			b[i] = hexdigits[rand.Intn(16)]
		}
	}
	return string(b)
}

func pick(s []string) string { return s[rand.Intn(len(s))] }

// ---------------------------------------------------------------------------
// Failure scenarios (ground truth)
// ---------------------------------------------------------------------------

type window struct {
	name     string
	service  string
	start    time.Time
	end      time.Time
	rootCause string
}

func (w window) contains(t time.Time) bool {
	return !t.Before(w.start) && t.Before(w.end)
}

// ---------------------------------------------------------------------------
// Trace generation
// ---------------------------------------------------------------------------

type scenarios struct {
	payment, inventory, deadlock, notif window
}

// genTrace emits the correlated log lines for one order request, applying any
// active failure scenario based on the trace's start time t0.
func genTrace(out *[]LogMessage, id int, t0 time.Time, sc scenarios) {
	trace := uuid()
	orderID := fmt.Sprintf("ORD-%d", 100000+id)
	userID := fmt.Sprintf("%d", 500000+rand.Intn(200000))
	city := pick(cities)
	rest := pick(restaurants)
	amount := 150 + rand.Intn(1050)
	gw := pick(gateways)

	t := t0
	// hop advances the clock by a realistic per-service latency.
	hop := func(minMs, maxMs int) time.Time {
		t = t.Add(time.Duration(minMs+rand.Intn(maxMs-minMs+1)) * time.Millisecond)
		return t
	}
	base := func(extra ...field) []field {
		return append([]field{f("trace_id", trace), f("order_id", orderID), f("user_id", userID)}, extra...)
	}
	emit := func(ts time.Time, level, svc, event string, extra ...field) {
		*out = append(*out, LogMessage{
			Timestamp:  ts.UTC().Format(time.RFC3339Nano),
			Level:      level,
			Message:    logfmt(svc, event, base(extra...)...),
			ResourceID: svc,
		})
	}

	// --- Happy path through the pipeline -----------------------------------
	emit(hop(1, 5), "INFO", svcGateway, "request.received", f("route", "POST /v1/orders"), f("city", city))
	emit(hop(2, 15), "INFO", svcAuth, "auth.validate", f("result", "ok"))
	emit(hop(5, 25), "INFO", svcCart, "cart.fetch", f("items", "3"), f("restaurant_id", rest))
	emit(hop(3, 20), "INFO", svcCheckout, "checkout.initiate", fi("amount", amount))

	// --- Inventory (scenario 2: cache/DB oversell mismatch) ----------------
	item := pick(items)
	if sc.inventory.contains(t) && rand.Float64() < 0.75 {
		emit(hop(4, 20), "ERROR", svcInventory, "inventory.reserve.mismatch",
			f("item", item), f("cache_qty", "7"), f("db_qty", "0"), f("reason", "stale_cache_after_restock"),
			f("msg", "reserved from cache but DB shows out of stock"))
		emit(hop(2, 10), "WARN", svcOrder, "order.cancel", f("item", item), f("reason", "out_of_stock"),
			f("msg", "order cancelled due to inventory mismatch"))
		return
	}
	emit(hop(4, 25), "INFO", svcInventory, "inventory.reserve", f("item", item), f("qty", "1"), f("result", "reserved"))
	emit(hop(2, 12), "INFO", svcPricing, "pricing.calculate", fi("amount", amount), f("coupon", "WELCOME50"))

	// --- Payment (scenario 1: gateway timeout) -----------------------------
	if sc.payment.contains(t) && rand.Float64() < 0.8 {
		emit(hop(1900, 2100), "ERROR", svcPayment, "payment.charge.timeout",
			f("gateway", gw), f("timeout_ms", "2000"), f("msg", "payment gateway timeout, no response"))
		emit(hop(2, 10), "ERROR", svcOrder, "order.create.aborted",
			f("reason", "payment_unconfirmed"), f("msg", "order aborted, payment not confirmed"))
		emit(hop(1, 6), "ERROR", svcCheckout, "checkout.failed",
			f("reason", "payment_failed"), f("msg", "checkout failed for user"))
		return
	}
	emit(hop(120, 600), "INFO", svcPayment, "payment.charge", f("gateway", gw), fi("amount", amount), f("status", "captured"))

	// --- Order create (scenario 3: DB deadlock) ----------------------------
	if sc.deadlock.contains(t) && rand.Float64() < 0.6 {
		emit(hop(30, 120), "ERROR", svcOrder, "order.create.failed",
			f("db", "postgres"), f("sqlstate", "40P01"), f("table", "orders"),
			f("msg", "deadlock detected, transaction rolled back"))
		emit(hop(50, 200), "WARN", svcOrder, "order.create.retry", f("attempt", "2"),
			f("msg", "retrying after deadlock"))
		if rand.Float64() < 0.5 {
			emit(hop(200, 800), "ERROR", svcOrder, "order.create.failed",
				f("db", "postgres"), f("sqlstate", "40P01"), f("table", "orders"),
				f("msg", "deadlock detected, transaction rolled back"))
			return
		}
		// recovers on retry (slow)
		emit(hop(100, 400), "INFO", svcOrder, "order.create", f("status", "confirmed"), f("latency_ms", "980"))
	} else {
		emit(hop(20, 90), "INFO", svcOrder, "order.create", f("status", "confirmed"))
	}

	emit(hop(5, 30), "INFO", svcRestaurant, "restaurant.accept", f("restaurant_id", rest), f("eta_min", "28"))
	emit(hop(10, 60), "INFO", svcDelivery, "delivery.assign", f("rider_id", fmt.Sprintf("RIDER-%d", 200+rand.Intn(600))), f("eta_min", "34"))

	// --- Notification (scenario 4: SMS provider outage) --------------------
	if sc.notif.contains(t) && rand.Float64() < 0.85 {
		emit(hop(5, 30), "ERROR", svcNotification, "notification.send.failed",
			f("channel", "sms"), f("provider", "twilio"), f("err", "connection refused"),
			f("msg", "failed to send order confirmation"))
		emit(hop(1, 5), "WARN", svcNotification, "notification.dlq", f("channel", "sms"),
			f("msg", "notification queued to dead letter queue"))
		return
	}
	emit(hop(5, 40), "INFO", svcNotification, "notification.send", f("channel", "sms"), f("status", "delivered"))
}

// rootCauseSignals emits the "smoking gun" logs at each failure window's start —
// the change/dependency event that explains the spike that follows.
func rootCauseSignals(out *[]LogMessage, sc scenarios) {
	add := func(t time.Time, level, svc, event string, extra ...field) {
		*out = append(*out, LogMessage{
			Timestamp:  t.UTC().Format(time.RFC3339Nano),
			Level:      level,
			Message:    logfmt(svc, event, extra...),
			ResourceID: svc,
		})
	}
	// FS1 — a config reload cut the gateway timeout far too low, just before the spike.
	add(sc.payment.start.Add(-30*time.Second), "WARN", svcPayment, "config.reload",
		f("key", "gateway_timeout_ms"), f("old", "8000"), f("new", "2000"), f("deploy", "payment@v2.4.0"),
		f("msg", "applying new gateway timeout"))
	add(sc.payment.start.Add(10*time.Second), "WARN", svcPayment, "dependency.health",
		f("gateway", "razorpay"), f("status", "degraded"), f("p99_ms", "4200"))
	// FS2 — a restock refreshed the cache but skipped DB invalidation → oversell.
	add(sc.inventory.start.Add(-20*time.Second), "WARN", svcInventory, "cache.refresh",
		f("source", "redis"), f("keyspace", "stock"), f("db_invalidated", "false"),
		f("msg", "stock cache refreshed after restock without DB invalidation"))
	// FS3 — connection-pool saturation precedes the deadlock storm.
	add(sc.deadlock.start.Add(-25*time.Second), "WARN", svcOrder, "db.pool.saturation",
		f("db", "postgres"), f("active", "50"), f("max", "50"), f("msg", "connection pool exhausted under load"))
	// FS4 — the SMS provider went down at the window start.
	add(sc.notif.start, "ERROR", svcNotification, "dependency.down",
		f("provider", "twilio"), f("endpoint", "sms"), f("status", "connection_refused"),
		f("msg", "SMS provider unreachable"))
}

// heartbeats emit steady, low-rate health logs per service across the window, so
// the failure windows stand out as spikes rather than the only activity.
func heartbeats(out *[]LogMessage, start, end time.Time) {
	for _, svc := range allServices {
		for t := start; t.Before(end); t = t.Add(30 * time.Second) {
			ts := t.Add(time.Duration(rand.Intn(30000)) * time.Millisecond)
			*out = append(*out, LogMessage{
				Timestamp:  ts.UTC().Format(time.RFC3339Nano),
				Level:      "INFO",
				Message:    logfmt(svc, "health.check", f("status", "ok"), f("rps", fmt.Sprintf("%d", 20+rand.Intn(400)))),
				ResourceID: svc,
			})
			// rare baseline error unrelated to the injected scenarios
			if rand.Float64() < 0.02 {
				*out = append(*out, LogMessage{
					Timestamp:  ts.UTC().Format(time.RFC3339Nano),
					Level:      "ERROR",
					Message:    logfmt(svc, "internal.error", f("code", "500"), f("msg", "unexpected internal error")),
					ResourceID: svc,
				})
			}
		}
	}
}

func main() {
	numCPU := runtime.NumCPU()
	runtime.GOMAXPROCS(numCPU)

	brokers := flag.String("brokers", "localhost:29092,localhost:39092", "Kafka brokers (comma-separated)")
	topic := flag.String("topic", "logs", "Kafka topic")
	orders := flag.Int("orders", 40000, "number of order traces to generate")
	hours := flag.Float64("hours", 6, "spread logs over the last N hours")
	workers := flag.Int("goroutines", 10, "producer goroutines")
	flag.Parse()

	end := time.Now().UTC()
	start := end.Add(-time.Duration(*hours * float64(time.Hour)))
	span := end.Sub(start)

	// Failure windows placed at fractions of the span so they always land inside.
	at := func(frac float64) time.Time { return start.Add(time.Duration(frac * float64(span))) }
	sc := scenarios{
		payment:   window{"payment_gateway_timeout", svcPayment, at(0.15), at(0.15).Add(20 * time.Minute), "config.reload dropped gateway_timeout_ms 8000→2000 (deploy payment@v2.4.0); razorpay p99 4.2s > 2s → charges time out → orders aborted"},
		inventory: window{"inventory_oversell", svcInventory, at(0.45), at(0.45).Add(15 * time.Minute), "stock cache refreshed after restock without DB invalidation → reservations succeed from stale cache while DB qty=0 → orders cancelled out_of_stock"},
		deadlock:  window{"order_db_deadlock", svcOrder, at(0.65), at(0.65).Add(25 * time.Minute), "postgres connection pool exhausted under load → deadlock (SQLSTATE 40P01) on orders table → order.create failures + retry storm"},
		notif:     window{"notification_sms_outage", svcNotification, at(0.88), at(0.88).Add(30 * time.Minute), "twilio SMS provider connection_refused → notification.send failures + DLQ (orders still succeed; non-blocking)"},
	}

	fmt.Printf("Generating ~%d order traces over %.1fh (%s → %s UTC)\n",
		*orders, *hours, start.Format("15:04"), end.Format("15:04"))

	logs := make([]LogMessage, 0, *orders*10)
	for i := 0; i < *orders; i++ {
		t0 := start.Add(time.Duration(rand.Int63n(int64(span))))
		genTrace(&logs, i, t0, sc)
	}
	rootCauseSignals(&logs, sc)
	heartbeats(&logs, start, end)

	// Sort by time so the stream looks like a real chronological feed.
	sort.Slice(logs, func(i, j int) bool { return logs[i].Timestamp < logs[j].Timestamp })

	serialized := make([][]byte, len(logs))
	for i, m := range logs {
		data, err := json.Marshal(m)
		if err != nil {
			data = []byte("{}")
		}
		serialized[i] = data
	}
	fmt.Printf("Generated %d log lines. Publishing to %s (topic %q)...\n", len(logs), *brokers, *topic)

	producer := NewProducer(strings.Split(*brokers, ","), *topic)
	defer producer.Close()
	producer.sendParallel(context.Background(), serialized, *workers)

	printGroundTruth(sc)
}

func printGroundTruth(sc scenarios) {
	fmt.Println("\n──────────────────────────────────────────────────────────────")
	fmt.Println("GROUND TRUTH — injected failure scenarios (for grading the LLM)")
	fmt.Println("──────────────────────────────────────────────────────────────")
	for i, w := range []window{sc.payment, sc.inventory, sc.deadlock, sc.notif} {
		fmt.Printf("\n%d. %s  [service: %s]\n", i+1, w.name, w.service)
		fmt.Printf("   window (UTC): %s → %s\n", w.start.Format("15:04:05"), w.end.Format("15:04:05"))
		fmt.Printf("   root cause  : %s\n", w.rootCause)
	}
	fmt.Println("\nExample questions to ask the AI search:")
	fmt.Printf("  • \"why did %s errors spike around %s?\"\n", svcPayment, sc.payment.start.Format("15:04"))
	fmt.Printf("  • \"what caused order cancellations near %s?\"\n", sc.inventory.start.Format("15:04"))
	fmt.Printf("  • \"investigate the %s failures around %s\"\n", svcOrder, sc.deadlock.start.Format("15:04"))
	fmt.Println("──────────────────────────────────────────────────────────────")
}
