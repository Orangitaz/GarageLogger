FROM node:22-alpine
WORKDIR /app
COPY server.js index.html ./
COPY public ./public
ENV DATA_DIR=/data PORT=3000 NODE_ENV=production
RUN mkdir -p /data && chown 568:568 /data
USER 568:568
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "server.js"]
