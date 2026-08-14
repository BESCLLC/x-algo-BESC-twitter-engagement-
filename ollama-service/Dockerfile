# Standalone Railway service: Ollama with a model baked into the image, so
# container restarts are instant instead of re-downloading multi-GB weights
# every boot. Deploy this by pointing a Railway service's Root Directory at
# this folder (see README.md in this directory for the exact steps).
FROM ollama/ollama:latest

# Override with a Railway build arg if you want a different model.
# qwen2.5:14b-instruct — strong instruction-following/writing quality for
# the rewrite task. Needs real RAM headroom (see README.md sizing note);
# drop to llama3.2:3b if the service is memory-constrained.
ARG MODEL=qwen2.5:14b-instruct

# Bring the server up just long enough to pull the model into the image layer,
# then let the container's real ENTRYPOINT run it for real at runtime.
RUN (ollama serve &) && sleep 5 && ollama pull ${MODEL}

EXPOSE 11434
ENV OLLAMA_HOST=0.0.0.0:11434
ENTRYPOINT ["ollama", "serve"]
