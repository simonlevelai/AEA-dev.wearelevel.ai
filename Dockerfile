# Ask Eve Assist - Healthcare Chatbot Container
# Cost-optimized Container Apps deployment with Microsoft 365 Agents SDK

# Use Node.js 20 Alpine for small image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install production dependencies first (for Docker layer caching)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application files
COPY dist/ ./dist/
COPY config/ ./config/
COPY public/ ./public/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S askeve -u 1001 -G nodejs

# Change ownership to non-root user
RUN chown -R askeve:nodejs /app
USER askeve

# Expose port 3000 (Container Apps standard)
EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Start the healthcare bot with Microsoft 365 SDK
CMD ["node", "dist/index-real-m365.js"]