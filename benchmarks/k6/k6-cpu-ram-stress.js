import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const TARGET_URL = __ENV.TARGET_URL || "http://localhost:3000";
const cpuDuration = new Trend("cpu_compute_duration");
const errorRate = new Rate("error_rate");

export const options = {
  scenarios: {
    cpu_ram_stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 20 },  // Warmup
        { duration: "25s", target: 60 },  // High CPU computation load
        { duration: "25s", target: 100 }, // Peak memory & CPU stress
        { duration: "10s", target: 0 },   // Cool down
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<800"],
  },
};

export default function () {
  // Menguji efisiensi loop kalkulasi CPU, token hashing, dan serialisasi JSON pada 200 items
  const res = http.get(`${TARGET_URL}/api/benchmark/cpu-json?limit=200`);
  cpuDuration.add(res.timings.duration);

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "has transformed data": (r) => r.json("data.0.tax") !== undefined,
  });

  errorRate.add(!ok);

  sleep(0.02); // 20ms thinking time
}
