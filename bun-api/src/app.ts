import { Hono } from "hono";
import { cors } from "hono/cors";
import { categoriesRoute } from "./routes/categories";
import { productsRoute } from "./routes/products";
import { httpLogger } from "./lib/logger";

const isProduction = process.env.NODE_ENV === "production";

export function createApp() {
  const app = new Hono();

  // 1. Global Middleware
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    })
  );

  // 2. Structured Request Timing Logger (Development/Staging only)
  if (!isProduction) {
    app.use("*", async (c, next) => {
      const start = performance.now();
      await next();
      const durationMs = Number((performance.now() - start).toFixed(2));
      httpLogger.info(
        {
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          durationMs,
        },
        `HTTP ${c.res.status} ${c.req.method} ${c.req.path} [${durationMs}ms]`
      );
    });
  }

  // 3. Healthcheck Endpoint
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      runtime: "bun",
      version: Bun.version,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    });
  });

  // 4. Mounting Modular Sub-Routes
  app.route("/api/categories", categoriesRoute);
  app.route("/api/products", productsRoute);

  // 5. Centralized Global Error Handler
  app.onError((err: any, c) => {
    // If VineJS validation error (has .messages property)
    if (err.messages) {
      return c.json(
        {
          success: false,
          error: "Validation failed",
          details: err.messages,
        },
        400
      );
    }

    const detailedMessage =
      err.cause?.message || err.detail || err.message || "Internal Server Error";

    if (!isProduction) {
      httpLogger.error(
        { method: c.req.method, path: c.req.path, error: detailedMessage },
        `Unhandled Exception on ${c.req.path}: ${detailedMessage}`
      );
    }

    return c.json(
      {
        success: false,
        error: detailedMessage,
        queryError: err.message,
      },
      400
    );
  });

  // 6. Not Found Fallback
  app.notFound((c) => {
    return c.json({ success: false, message: "Not Found" }, 404);
  });

  return app;
}
