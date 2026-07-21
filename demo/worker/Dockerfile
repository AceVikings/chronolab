FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node worker.js .
USER node
CMD ["node", "worker.js"]
