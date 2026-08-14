# Standalone Railway service running Ollama. The model is pulled at
# container startup (start.sh), not baked into the image at build time —
# baking it in via a backgrounded-server build trick turned out unreliable
# in practice (the image shipped with zero blobs despite the build step
# appearing to succeed). Attach a Railway Volume at /root/.ollama so the
# pulled model persists across restarts/redeploys — see README.md.
FROM ollama/ollama:latest

# Override with a Railway build arg if you want a different model.
ARG MODEL=qwen2.5:14b-instruct
ENV MODEL_NAME=${MODEL}
ENV OLLAMA_HOST=0.0.0.0:11434

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 11434
ENTRYPOINT ["/start.sh"]
