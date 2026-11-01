FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@9.15.0
RUN pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm --filter @workspace/db build 2>/dev/null || true
RUN pnpm --filter @workspace/api-spec build 2>/dev/null || true
RUN pnpm --filter @workspace/api-zod build 2>/dev/null || true
RUN pnpm --filter @workspace/api-client-react build 2>/dev/null || true
EXPOSE 3000
ENV PORT=3000
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
