FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libsqlite3-dev && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist /app/static
RUN mkdir -p /data
ENV DATABASE_URL="sqlite:////data/jeopardy.db"
ENV STATIC_DIR="/app/static"
ENV PORT=9420
EXPOSE 9420
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-9420}"]
