# Use Node.js 21 Alpine for smaller image size
FROM node:21-alpine

# Set working directory
WORKDIR /api

# Install dependencies for native modules (if needed)
RUN apk add --no-cache python3 make g++

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build to reduce image size
# RUN npm prune --production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy entrypoint script
COPY entrypoint.sh /api/entrypoint.sh
RUN chmod +x /api/entrypoint.sh

# Change ownership of api directory
RUN chown -R nodejs:nodejs /api
USER nodejs

# Expose port (adjust if your app uses different port)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Set the entrypoint script
ENTRYPOINT ["/api/entrypoint.sh"]

# Start the application
CMD ["node", "dist/src/index.js"]