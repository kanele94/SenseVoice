# ======================================================
#   FunASR SenseVoiceSmall Inference Server
# ======================================================
FROM pytorch/pytorch:2.13.0-cuda13.2-cudnn9-runtime

# Install system dependencies
RUN apt-get update && apt-get install -y \
	ffmpeg libsndfile1 git && \
	rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only requirements first
COPY requirements.txt /app/

# Resolve torch/torchaudio against the CUDA 13.2 wheel index so a dependency
# bump never swaps the base image's CUDA build for a default CPU/CUDA 12 wheel.
ENV PIP_EXTRA_INDEX_URL=https://download.pytorch.org/whl/cu132
# The CUDA 13.x images ship a PEP 668 externally-managed interpreter; the
# container is the environment, so install straight into it.
ENV PIP_BREAK_SYSTEM_PACKAGES=1

# Install dependencies (cached if requirements.txt didn't change)
RUN pip install --no-cache-dir -r requirements.txt

# Fail the build early if the CUDA-enabled torch got replaced during resolution
RUN python -c "import torch; print('torch', torch.__version__, 'cuda', torch.version.cuda); assert torch.version.cuda.startswith('13.'), torch.version.cuda"

# Now copy the rest of your code
COPY . /app


# Optional: preload model weights during build (saves runtime download)
# RUN python -c "from funasr import AutoModel; AutoModel(model='iic/SenseVoiceSmall')"

# Expose FastAPI port
EXPOSE 5000

# Environment variables
ENV SENSEVOICE_DEVICE=auto
ENV PYTHONUNBUFFERED=1
ENV MODELSCOPE_CACHE=/models

# Create model cache directory (helps reuse between restarts)
RUN mkdir -p /models

# Start FastAPI app
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "5000"]
