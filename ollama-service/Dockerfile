# Standalone Railway service running Ollama. The model is pulled at
# container startup (start.sh), not baked into the image at build time —
# baking it in via a backgrounded-server build trick turned out unreliable
# in practice (the image shipped with zero blobs despite the build step
# appearing to succeed). Attach a Railway Volume at /root/.ollama so the
# pulled model persists across restarts/redeploys — see README.md.
FROM ollama/ollama:latest

# Override with a Railway build arg if you want a different model.
# llama3.2:3b: dropped down from 7b after THAT also hit the same 100s
# timeout wall, three times in a row, with the health check confirming
# connectivity/model-loading were never the problem. This is a diagnostic
# step as much as a fix — if 3b still times out, the bottleneck is this
# service's actual CPU allocation, not model size, and no amount of
# further downsizing will fix it.
ARG MODEL=llama3.2:3b
ENV MODEL_NAME=${MODEL}
ENV OLLAMA_HOST=0.0.0.0:11434

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 11434
ENTRYPOINT ["/start.sh"]
