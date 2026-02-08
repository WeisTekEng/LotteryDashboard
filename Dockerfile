FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --only=production

# Bundle app source
COPY . .

# Capture Git Info during build
ARG GIT_BRANCH=Unknown
ARG GIT_COMMIT=Unknown
RUN echo "{\"branch\": \"$GIT_BRANCH\", \"hash\": \"$GIT_COMMIT\"}" > git_info.json

# Create non-root user and fix permissions
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /app/data && \
    chown -R appuser:appgroup /app

USER appuser

# Expose ports
EXPOSE 3000
EXPOSE 33333/udp

CMD ["node", "server.js"]
