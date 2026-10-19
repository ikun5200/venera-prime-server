# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# 1. Frontend build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# 2. Rust JS sidecar (QuickJS)
# ---------------------------------------------------------------------------
FROM rust:1-slim-bookworm AS rust
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config && rm -rf /var/lib/apt/lists/*
ENV CARGO_NET_RETRY=10 \
    CARGO_HTTP_TIMEOUT=120 \
    CARGO_HTTP_MULTIPLEXING=false
WORKDIR /src/rust/js_host
COPY rust/js_host/ ./
# `vendor/` is present in local builds for an offline, deterministic build.
# CI builds without it and fetches crates from crates.io.
RUN if [ -d vendor ]; then \
      cargo build --release --locked --offline \
        --config 'source.crates-io.replace-with="vendored-sources"' \
        --config 'source.vendored-sources.directory="vendor"'; \
    else \
      cargo build --release --locked; \
    fi

# ---------------------------------------------------------------------------
# 3. Dart backend
# ---------------------------------------------------------------------------
FROM dart:stable AS dart
WORKDIR /src/backend
COPY backend/pubspec.yaml backend/pubspec.lock ./
RUN dart pub get
COPY backend/ ./
RUN mkdir -p /out && dart compile exe bin/server.dart -o /out/venera_server

# ---------------------------------------------------------------------------
# 4. Runtime
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gosu libsqlite3-dev libstdc++6 tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home --home-dir /home/venera venera

WORKDIR /app
COPY --from=dart /out/venera_server /app/venera_server
COPY --from=rust /src/rust/js_host/target/release/venera_js_host /app/venera_js_host
COPY --from=frontend /src/frontend/dist /app/frontend/dist
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod 0755 /app/venera_server /app/venera_js_host /app/docker-entrypoint.sh

ENV HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    DB_PATH=/data/venera.db \
    STATIC_DIR=/app/frontend/dist \
    JS_HOST_BIN=/app/venera_js_host \
    APP_ENV=production \
    LOG_LEVEL=info

VOLUME ["/data", "/config"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/venera_server"]
