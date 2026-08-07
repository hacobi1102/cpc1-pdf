FROM python:3.10-slim

# Cài đặt Tesseract OCR và tiếng Việt
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-vie \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài các thư viện Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ code lên
COPY . .
ENV PORT=8080
EXPOSE 8080

# Dùng $PORT do Railway cấp (mặc định 8080 nếu không có)
# --timeout 120: tránh timeout khi xử lý file PDF lớn
# --workers 1: tiết kiệm RAM trên Railway free tier
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT:-8080} --timeout 120 --workers 1"]