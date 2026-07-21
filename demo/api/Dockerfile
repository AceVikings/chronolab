FROM node:22-bookworm-slim
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --chown=node:node app.js .
USER node
EXPOSE 3000
CMD ["node", "app.js"]
