import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const TARGET_URL = __ENV.TARGET_URL || "http://localhost:3000";
const browseDuration = new Trend("browse_duration");
const errorRate = new Rate("error_rate");

export const options = {
  scenarios: {
    ecommerce_browsing: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 20 }, // Warmup
        { duration: "30s", target: 50 }, // Normal traffic (50 concurrent shoppers)
        { duration: "20s", target: 80 }, // Peak traffic (80 concurrent shoppers)
        { duration: "10s", target: 0 },  // Wind down
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function () {
  const rand = Math.random();

  if (rand < 0.7) {
    // 70% Read: Paginated Products browsing (Pagination Only)
    const page = Math.floor(Math.random() * 50) + 1;
    const res = http.get(`${TARGET_URL}/api/products?page=${page}&limit=15`);
    browseDuration.add(res.timings.duration);
    const ok = check(res, {
      "browse paginated 200": (r) => r.status === 200,
      "has items": (r) => r.json("data.length") > 0,
    });
    errorRate.add(!ok);
  } else {
    // 30% Read: Categories listing
    const res = http.get(`${TARGET_URL}/api/categories`);
    browseDuration.add(res.timings.duration);
    const ok = check(res, { "categories 200": (r) => r.status === 200 });
    errorRate.add(!ok);
  }

  sleep(0.05);
}
