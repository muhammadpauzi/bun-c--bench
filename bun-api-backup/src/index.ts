import { createApp } from "./app";
import { httpLogger } from "./lib/logger";

export { createApp };

export function createServer(port = Number(process.env.PORT) || 3000) {
  const app = createApp();
  return Bun.serve({
    port,
    fetch: app.fetch,
  });
}

export const server = !import.meta.main ? null : createServer();

if (import.meta.main && server) {
  httpLogger.info(
    { port: server.port, env: process.env.NODE_ENV || "development" },
    `🚀 Gogoskola API server listening on http://localhost:${server.port}`
  );
}

export default server;
