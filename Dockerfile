# ============================================================================
# Dockerfile de produção — Gestão Nexus
# ============================================================================
#
# Build em multi-stage pra ter imagem final enxuta:
#   stage 1 (builder): instala deps de frontend + backend, builda o frontend
#   stage 2 (runtime): só Node + arquivos necessários pra rodar o backend
#                      e servir o frontend buildado
#
# O backend serve os arquivos estáticos do frontend a partir de
# /app/frontend/dist (caminho hardcoded relativo ao server.js).
# ============================================================================

# ----------------------------------------------------------------------------
# Stage 1 — Builder
# ----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copia tudo (package.json's, lockfiles, código)
COPY . .

# Instala deps do backend (production-ish, mas precisa estar tudo pro build não falhar)
RUN cd backend && npm ci

# Instala deps do frontend e builda
RUN cd frontend && npm ci && npm run build

# Verifica que o build foi gerado (falha cedo se não)
RUN test -f /app/frontend/dist/index.html

# ----------------------------------------------------------------------------
# Stage 2 — Runtime
# ----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

# Copia só o que o backend precisa em produção
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/backend /app/backend
COPY --from=builder /app/frontend/dist /app/frontend/dist

# Garante NODE_ENV=production no runtime (pode ser sobrescrito por env do Railway)
ENV NODE_ENV=production

# Porta padrão (Railway injeta a real via $PORT, server.js usa env.PORT)
EXPOSE 3001

# Comando de start: migra banco, seeda admin, e sobe o backend
# (que serve a API + os estáticos do frontend)
CMD ["npm", "run", "start"]
