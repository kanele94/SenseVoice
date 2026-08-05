# ======================================================
#   FunASR SenseVoiceSmall Inference Server
# ======================================================
# CUDA 13.0, not 13.2: torchaudio (maintenance mode) ships no cu132 build —
# its newest wheels are 2.11.0+cu130 — and api.py imports torchaudio, whose
# loader hard-fails on any torch/torchaudio CUDA version mismatch.
FROM pytorch/pytorch:2.13.0-cuda13.0-cudnn9-runtime

# Install system dependencies
RUN apt-get update && apt-get install -y \
	ffmpeg libsndfile1 git && \
	rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only requirements first
COPY requirements.txt /app/

# Resolve torch/torchaudio against the CUDA 13.0 wheel index so a dependency
# bump never swaps the base image's CUDA build for a default CPU wheel.
ENV PIP_EXTRA_INDEX_URL=https://download.pytorch.org/whl/cu130
# The CUDA 13.x images ship a PEP 668 externally-managed interpreter; the
# container is the environment, so install straight into it.
ENV PIP_BREAK_SYSTEM_PACKAGES=1

# Install dependencies (cached if requirements.txt didn't change)
RUN pip install --no-cache-dir -r requirements.txt

# Fail the build early if the CUDA-enabled torch got replaced during resolution,
# if torchaudio's CUDA build no longer matches torch's (checked on import), or
# if audio decoding is broken (torchaudio.load delegates to torchcodec+FFmpeg,
# neither of which is validated by a plain import of torchaudio).
RUN python - <<'EOF'
import math, struct, wave
import torch, torchaudio

print("torch", torch.__version__, "cuda", torch.version.cuda, "| torchaudio", torchaudio.__version__)
assert torch.version.cuda.startswith("13."), torch.version.cuda

with wave.open("/tmp/probe.wav", "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(16000)
    w.writeframes(b"".join(struct.pack("<h", int(10000 * math.sin(i / 10))) for i in range(1600)))
waveform, fs = torchaudio.load("/tmp/probe.wav")
assert fs == 16000 and waveform.numel() == 1600, (fs, waveform.shape)
print("torchaudio.load OK (torchcodec backend works)")
EOF

# Environment variables
ENV SENSEVOICE_DEVICE=auto
ENV PYTHONUNBUFFERED=1
ENV MODELSCOPE_CACHE=/models

# api.py loads the model at import time, so uvicorn does not bind its port
# until the weights are in place — with an empty cache every request is
# refused for as long as the ModelScope download takes. Mount pre-fetched
# weights over /models (see docker-compose.yaml) to avoid that cold start.
RUN mkdir -p /models

# Now copy the rest of your code
COPY . /app

# Expose FastAPI port
EXPOSE 5000

# Start FastAPI app
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "5000"]
