import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

const TARGET_URL = __ENV.TARGET_URL || "http://localhost:3000";
const errorRate = new Rate("error_rate");

export const options = {
  scenarios: {
    // Ramping Arrival Rate: Menguji batas RPS maksimal yang sanggup dilayani
    rps_staircase: {
      executor: "ramping-arrival-rate",
      startRate: 50,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 150,
      stages: [
        { duration: "20s", target: 100 },  // Step 1: 100 RPS
        { duration: "20s", target: 200 },  // Step 2: 200 RPS
        { duration: "20s", target: 350 },  // Step 3: 350 RPS (Batas saturasi 1 vCPU)
        { duration: "20s", target: 500 },  // Step 4: 500 RPS (Stress peak)
        { duration: "10s", target: 50 },   // Cool down
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1500"],
  },
};

export default function () {
  // Hit endpoint filter-sort dengan query cepat
  const res = http.get(
    `${TARGET_URL}/api/benchmark/filter-sort?minPrice=100000&maxPrice=1000000&limit=10`
  );

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
  });

  errorRate.add(!ok);
}
