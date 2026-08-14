# Standalone Railway service running Ollama. The model is pulled at
# container startup (start.sh), not baked into the image at build time —
# baking it in via a backgrounded-server build trick turned out unreliable
# in practice (the image shipped with zero blobs despite the build step
# appearing to succeed). Attach a Railway Volume at /root/.ollama so the
# pulled model persists across restarts/redeploys — see README.md.
FROM ollama/ollama:latest

# Override with a Railway build arg if you want a different model.
# qwen2.5:7b-instruct: chosen over the larger 14b variant after repeated
# real-world timeouts on CPU-only inference — same weight-aware prompt,
# roughly 2x the tokens/sec, reliably finishes within a web request.
ARG MODEL=qwen2.5:7b-instruct
ENV MODEL_NAME=${MODEL}
ENV OLLAMA_HOST=0.0.0.0:11434

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 11434
ENTRYPOINT ["/start.sh"]
