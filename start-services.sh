#!/bin/bash

# Start the broker in the background
echo "🚀 Starting LoRaWAN Broker..."
cd /Users/jorgerangel/Documents/dev/LoRaWAN-HTTPS-app/LoRaWAN\ Broker
node lorawan_broker_http.js > /tmp/broker.log 2>&1 &
BROKER_PID=$!
echo "Broker started with PID: $BROKER_PID"

# Wait for broker to start
sleep 3

# Test broker API
echo ""
echo "🧪 Testing broker API..."
curl -s http://localhost:3000/devices | json_pp || curl -s http://localhost:3000/devices

# Start React app in the background
echo ""
echo "🚀 Starting React App..."
cd /Users/jorgerangel/Documents/dev/LoRaWAN-HTTPS-app/my-app
npm run dev > /tmp/react.log 2>&1 &
REACT_PID=$!
echo "React app started with PID: $REACT_PID"

echo ""
echo "✅ Both services are running!"
echo "  - Broker: http://localhost:3000"
echo "  - React app: http://localhost:5173"
echo ""
echo "📋 Logs:"
echo "  - Broker: tail -f /tmp/broker.log"
echo "  - React: tail -f /tmp/react.log"
echo ""
echo "To stop services, press Ctrl+C"

# Keep script running
wait
