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

# Chạy Flask bằng Gunicorn. 
# CHÚ Ý: Đổi "app:app" nếu file của bạn không tên là app.py. 
# Ví dụ: nếu file là main.py, đổi thành "main:app"
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:10000"]