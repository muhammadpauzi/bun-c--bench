import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const TARGET_URL = __ENV.TARGET_URL || "http://localhost:3000";
const searchDuration = new Trend("dynamic_search_duration");
const errorRate = new Rate("error_rate");

export const options = {
  scenarios: {
    ecommerce_browsing: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 20 }, // Warmup
        { duration: "30s", target: 50 }, // Normal traffic (50 concurrent shoppers)
        { duration: "20s", target: 80 }, // Flash sale peak (80 concurrent shoppers)
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

  if (rand < 0.6) {
    // 60% Read: Filter & Pagination (Catalog browsing)
    const page = Math.floor(Math.random() * 50) + 1;
    const res = http.get(
      `${TARGET_URL}/api/benchmark/filter-sort?minPrice=50000&maxPrice=1000000&limit=15`
    );
    check(res, { "browse 200": (r) => r.status === 200 });
  } else {
    // 40% Write/POST: Dynamic Search with Filtering & Sorting
    const payload = JSON.stringify({
      pagination: { page: 1, limit: 10 },
      filter: {
        conditions: [
          { field: "price", operator: "gte", value: 100000 },
          { field: "name", operator: "ilike", value: "Galaxy" },
        ],
      },
      sort: [{ field: "price", order: "desc" }],
    });

    const res = http.post(`${TARGET_URL}/api/products/search`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    searchDuration.add(res.timings.duration);
    const ok = check(res, { "post search 200": (r) => r.status === 200 });
    errorRate.add(!ok);
  }

  sleep(0.05);
}
