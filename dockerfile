FROM python:3.10-slim

# System deps for InsightFace + OpenCV
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching)
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Copy backend code into /app
COPY backend/ /app/

# Create necessary folders
RUN mkdir -p /app/database /app/known_faces /app/unknown_faces /app/encodings /app/classroom_outputs

# Set working directory to where main.py lives
WORKDIR /app

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]