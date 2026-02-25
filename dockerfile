FROM python:3.10-slim

WORKDIR /app

# System deps for InsightFace + OpenCV
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Verify uvicorn installed
RUN python -m uvicorn --version

# Copy backend code
COPY backend/ .

# Create necessary folders
RUN mkdir -p /app/database /app/known_faces /app/unknown_faces /app/encodings /app/classroom_outputs

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]