#!/bin/sh
set -e

ollama serve &
SERVER_PID=$!

echo "Waiting for Ollama server to accept connections..."
until ollama list >/dev/null 2>&1; do
  sleep 1
done

if ollama list | grep -q "^${MODEL_NAME}"; then
  echo "Model ${MODEL_NAME} already present, skipping pull."
else
  echo "Pulling model ${MODEL_NAME} (first boot only if a volume is attached — this can take several minutes)..."
  ollama pull "${MODEL_NAME}"
fi

wait $SERVER_PID
