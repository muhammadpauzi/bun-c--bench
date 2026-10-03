import { spawn } from "child_process";
import os from "os";

// Determine number of workers: use WORKERS env or default to CPU count
const requestedWorkers = Number(process.env.WORKERS) || Math.min(os.cpus().length, 4);
const isWorker = process.env.IS_BUN_WORKER === "true";

if (isWorker) {
  // Worker process: Import and run server with reusePort enabled
  const { createApp } = await import("./app");
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;

  Bun.serve({
    port,
    reusePort: true, // Crucial: Allows kernel SO_REUSEPORT multi-threaded connection load balancing
    fetch: app.fetch,
  });

  console.log(`👷 Bun worker PID ${process.pid} listening on port ${port} (reusePort: true)`);
} else {
  // Master process: Spawns cluster workers across CPU cores
  console.log(`🚀 Starting Bun Cluster Master PID ${process.pid} with ${requestedWorkers} workers...`);

  const workers: any[] = [];

  for (let i = 0; i < requestedWorkers; i++) {
    const worker = spawn(process.execPath, ["src/cluster.ts"], {
      stdio: "inherit",
      env: {
        ...process.env,
        IS_BUN_WORKER: "true",
      },
    });

    worker.on("exit", (code) => {
      console.warn(`⚠️ Worker exited with code ${code}. Respawning worker...`);
      spawn(process.execPath, ["src/cluster.ts"], {
        stdio: "inherit",
        env: {
          ...process.env,
          IS_BUN_WORKER: "true",
        },
      });
    });

    workers.push(worker);
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log("Shutting down master and workers...");
    workers.forEach((w) => w.kill());
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
