FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000 \
    FLASK_PORT=8000 \
    AI_SERVICE_URL=http://127.0.0.1:8000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY ai.requirement.txt .
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r ai.requirement.txt

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.py server.js entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 5000 8000

CMD ["./entrypoint.sh"]
