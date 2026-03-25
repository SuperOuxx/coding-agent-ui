# =============================================================================
# coding-agent-ui Docker Image
# Base: python:3.12-slim-bookworm  +  Node.js 25 (via NodeSource)
# =============================================================================

FROM python:3.12-slim-bookworm AS base

LABEL maintainer="SuperOuxx/coding-agent-ui"
LABEL description="coding-agent-ui: A web-based UI for Claude Code CLI"

# ---------------------------------------------------------------------------
# System dependencies + Node.js 25 (NodeSource official setup script)
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      curl \
      ca-certificates \
      build-essential \
      libsqlite3-dev \
    && curl -fsSL https://deb.nodesource.com/setup_25.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Verify versions
RUN python3 --version && node --version && npm --version

# ---------------------------------------------------------------------------
# Clone the repository
# ---------------------------------------------------------------------------
WORKDIR /app
RUN git clone https://github.com/SuperOuxx/coding-agent-ui.git .

# install codex
RUN npm install -g @openai/codex

# ---------------------------------------------------------------------------
# Install Node.js dependencies & build frontend
# ---------------------------------------------------------------------------
RUN npm install --legacy-peer-deps
RUN npm run build

# ---------------------------------------------------------------------------
# Environment defaults (override via docker-compose or -e flags)
# ---------------------------------------------------------------------------
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

# Expose ports
EXPOSE 3001

# Copy entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
