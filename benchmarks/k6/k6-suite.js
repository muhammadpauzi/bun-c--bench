import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

const TARGET_URL = __ENV.TARGET_URL || "http://localhost:3000";

// Custom Trends to break down latency by benchmark case
const trendFilterSort = new Trend("case_filter_sort_duration");
const trendPagination = new Trend("case_pagination_deep_duration");
const trendSearchText = new Trend("case_search_text_duration");
const trendGroupAggregate = new Trend("case_group_aggregate_duration");
const trendCpuJson = new Trend("case_cpu_json_duration");
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
  // Deterministic random selection based on VU and iteration
  const rand = Math.random();

  if (rand < 0.25) {
    // Case 1: Filtering & Sorting (25%)
    const min = Math.floor(Math.random() * 50000);
    const max = min + 200000;
    const res = http.get(
      `${TARGET_URL}/api/benchmark/filter-sort?minPrice=${min}&maxPrice=${max}&limit=20`
    );
    trendFilterSort.add(res.timings.duration);
    const success = check(res, { "filter-sort 200": (r) => r.status === 200 });
    errorRate.add(!success);
  } else if (rand < 0.45) {
    // Case 2: Deep Pagination (20%)
    const page = Math.floor(Math.random() * 1000) + 1;
    const res = http.get(
      `${TARGET_URL}/api/benchmark/pagination-deep?page=${page}&limit=20`
    );
    trendPagination.add(res.timings.duration);
    const success = check(res, { "pagination-deep 200": (r) => r.status === 200 });
    errorRate.add(!success);
  } else if (rand < 0.65) {
    // Case 3: Search Text ILIKE on 500k data (20%)
    const queries = ["Galaxy", "Buku", "Xiaomi", "Paket", "Dasar"];
    const q = queries[Math.floor(Math.random() * queries.length)];
    const res = http.get(`${TARGET_URL}/api/benchmark/search-text?q=${q}&limit=20`);
    trendSearchText.add(res.timings.duration);
    const success = check(res, { "search-text 200": (r) => r.status === 200 });
    errorRate.add(!success);
  } else if (rand < 0.80) {
    // Case 4: Grouping & Aggregation (15%)
    const res = http.get(`${TARGET_URL}/api/benchmark/group-aggregate`);
    trendGroupAggregate.add(res.timings.duration);
    const success = check(res, { "group-aggregate 200": (r) => r.status === 200 });
    errorRate.add(!success);
  } else {
    // Case 5: CPU Compute & Heavy JSON Serialization (20%)
    const res = http.get(`${TARGET_URL}/api/benchmark/cpu-json?limit=150`);
    trendCpuJson.add(res.timings.duration);
    const success = check(res, { "cpu-json 200": (r) => r.status === 200 });
    errorRate.add(!success);
  }

  // Pacing: slight sleep between requests to simulate client thinking
  sleep(0.05);
}
