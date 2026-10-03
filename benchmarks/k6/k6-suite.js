import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

const TARGET_URL = __ENV.TARGET_URL || "http://localhost:3000";

// Custom Trends to break down latency by CRUD/pagination case
const trendStandardPagination = new Trend("case_standard_pagination_duration");
const trendDeepPagination = new Trend("case_deep_pagination_duration");
const trendCategories = new Trend("case_categories_duration");
const trendHealth = new Trend("case_health_duration");
const errorRate = new Rate("error_rate");

export const options = {
  scenarios: {
    benchmark_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 20 },  // Warmup
        { duration: "20s", target: 50 },  // Ramp-up to moderate load
        { duration: "30s", target: 50 },  // Sustained steady load
        { duration: "20s", target: 100 }, // Peak stress load
        { duration: "10s", target: 0 },   // Cool down
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"], // max 5% error under peak stress
    http_req_duration: ["p(95)<1000"], // 95% of requests under 1s
  },
};

export default function () {
  const rand = Math.random();

  if (rand < 0.50) {
    // Case 1: Standard Pagination (Page 1-50, Limit 10) (50%)
    const page = Math.floor(Math.random() * 50) + 1;
    const res = http.get(`${TARGET_URL}/api/products?page=${page}&limit=10`);
    trendStandardPagination.add(res.timings.duration);
    const success = check(res, {
      "standard pagination 200": (r) => r.status === 200,
      "has items": (r) => r.json("data.length") > 0,
    });
    errorRate.add(!success);
  } else if (rand < 0.75) {
    // Case 2: Deep Pagination (Page 500-2000, Limit 20) (25%)
    const page = Math.floor(Math.random() * 1500) + 500;
    const res = http.get(`${TARGET_URL}/api/products?page=${page}&limit=20`);
    trendDeepPagination.add(res.timings.duration);
    const success = check(res, {
      "deep pagination 200": (r) => r.status === 200,
      "has items": (r) => r.json("data.length") > 0,
    });
    errorRate.add(!success);
  } else if (rand < 0.90) {
    // Case 3: Categories Listing (15%)
    const res = http.get(`${TARGET_URL}/api/categories`);
    trendCategories.add(res.timings.duration);
    const success = check(res, { "categories 200": (r) => r.status === 200 });
    errorRate.add(!success);
  } else {
    // Case 4: Healthcheck (10%)
    const res = http.get(`${TARGET_URL}/health`);
    trendHealth.add(res.timings.duration);
    const success = check(res, { "health 200": (r) => r.status === 200 });
    errorRate.add(!success);
  }

  // Pacing: slight sleep between requests to simulate client thinking
  sleep(0.05);
}
