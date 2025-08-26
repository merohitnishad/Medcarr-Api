# Use Node.js 21 Alpine for smaller image size
FROM node:21-alpine AS builder

# Set working directory
WORKDIR /api

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript into dist
RUN npm run build

### Final smaller runtime image
FROM node:21-alpine AS runtime

WORKDIR /api

# Set production environment and install only production dependencies
ENV NODE_ENV=production
COPY package*.json ./
# Use --omit=dev to ensure dev deps aren't installed and clean npm cache to reduce layer size
RUN npm ci --omit=dev --silent --no-audit --no-fund \
  && npm cache clean --force \
  && rm -rf /root/.npm /root/.cache

# Copy built dist and necessary files from builder
COPY --from=builder /api/dist ./dist
COPY --from=builder /api/entrypoint.sh ./entrypoint.sh
# Copy drizzle config and source so runtime can run migrations
COPY --from=builder /api/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /api/drizzle ./drizzle

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

RUN chmod +x /api/entrypoint.sh

# Change ownership of api directory
RUN chown -R nodejs:nodejs /api
USER nodejs

# Expose port (adjust if your app uses different port)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Copy node_modules from builder that contains drizzle-kit
COPY --from=builder /api/node_modules ./node_modules

# Set the entrypoint script
ENTRYPOINT ["/api/entrypoint.sh"]

# Start the application using start script (loads dotenv)
CMD ["npm", "start"]