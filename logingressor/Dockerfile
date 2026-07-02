FROM golang:1.22.3-alpine AS builder

WORKDIR /app

COPY . .

RUN go mod download

RUN go build -o main ./cmd/main.go

FROM alpine:latest
WORKDIR /root
RUN apk --no-cache add ca-certificates



COPY --from=builder /app/main .

EXPOSE 8080

ENTRYPOINT ["./main"]
