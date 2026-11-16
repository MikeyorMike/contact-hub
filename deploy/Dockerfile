# 轻contacts 镜像：基于 Node 24（内置 node:sqlite），零构建、零依赖安装
FROM node:24-alpine

WORKDIR /app

# 只拷贝运行所需文件，镜像更小
COPY package.json server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

ENV PORT=3000 \
    DATA_DIR=/data \
    NODE_ENV=production

RUN mkdir -p /data && addgroup -S app && adduser -S app -G app && chown -R app:app /data /app
USER app

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
