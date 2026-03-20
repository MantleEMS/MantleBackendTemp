FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for the entire monorepo
COPY package*.json ./
COPY shared/package*.json ./shared/

# Copy all service package.jsons to leverage layer caching for npm install
COPY services/auth/package*.json ./services/auth/
COPY services/incident/package*.json ./services/incident/
COPY services/dispatch/package*.json ./services/dispatch/
COPY services/timeline/package*.json ./services/timeline/
COPY services/media/package*.json ./services/media/
COPY services/notification/package*.json ./services/notification/
COPY services/ai-orchestrator/package*.json ./services/ai-orchestrator/

RUN npm install

# Build the shared library first
COPY shared ./shared
RUN npm run build --workspace=@mantle/shared

# Copy and build the target service
ARG SERVICE_NAME
COPY services/${SERVICE_NAME} ./services/${SERVICE_NAME}
RUN npm run build --workspace=@mantle/${SERVICE_NAME}-service

FROM node:20-alpine

WORKDIR /app
ARG SERVICE_NAME
ENV SERVICE_NAME_ENV=${SERVICE_NAME}

# Copy built assets and production node_modules
# We need to copy the shared library build as well since it's a dependency
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/package.json
COPY --from=builder /app/services/${SERVICE_NAME}/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY services/${SERVICE_NAME}/package.json ./

ENV NODE_ENV=production

CMD node dist/index.js
