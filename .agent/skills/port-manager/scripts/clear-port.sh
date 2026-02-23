#!/bin/bash
# clear-port.sh — Kill processes on one or more ports
# Usage: ./clear-port.sh 3000 3001 3002

if [ $# -eq 0 ]; then
  echo "Usage: clear-port.sh <port1> [port2] [port3] ..."
  echo "Example: clear-port.sh 3000 3001 3002"
  exit 1
fi

for PORT in "$@"; do
  PID=$(lsof -t -i :"$PORT" 2>/dev/null)
  if [ -n "$PID" ]; then
    echo "🔴 Port $PORT is in use by PID $PID — killing..."
    kill -9 $PID 2>/dev/null
    echo "✅ Port $PORT is now free."
  else
    echo "✅ Port $PORT is already free."
  fi
done

echo ""
echo "All specified ports cleared."
