# =============================================================================
# coding-agent-ui Docker Image
# Base: Node.js 25 (Debian Bookworm) + Python 3.12
# =============================================================================

FROM node:25-bookworm-slim AS base

LABEL maintainer="SuperOuxx/coding-agent-ui"
LABEL description="coding-agent-ui: A web-based UI for Claude Code CLI"

# ---------------------------------------------------------------------------
# System dependencies + Python 3.12
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      curl \
      ca-certificates \
      build-essential \
      python3.12 \
      python3.12-dev \
      python3-pip \
      python3-venv \
      libsqlite3-dev \
    && ln -sf /usr/bin/python3.12 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.12 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# Verify versions
RUN node --version && npm --version && python3 --version

# ---------------------------------------------------------------------------
# Clone the repository
# ---------------------------------------------------------------------------
WORKDIR /app
RUN git clone https://github.com/SuperOuxx/coding-agent-ui.git .

# ---------------------------------------------------------------------------
# Install Node.js dependencies & build frontend
# ---------------------------------------------------------------------------
RUN npm install --legacy-peer-deps
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime image (reuse base to keep it simple)
# ---------------------------------------------------------------------------
FROM base AS runtime

WORKDIR /app

# Copy built artifacts from build stage
COPY --from=base /app /app

# ---------------------------------------------------------------------------
# Environment defaults (override via docker-compose or -e flags)
# ---------------------------------------------------------------------------
ENV NODE_ENV=production \
    PORT=3001 \
    VITE_PORT=5173 \
    HOST=0.0.0.0

# Expose ports
EXPOSE 3001
EXPOSE 5173

# Copy entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
