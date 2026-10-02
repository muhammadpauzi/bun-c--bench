import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 1,
  iterations: 1,
};

const BASE_URL = __ENV.TARGET_URL || "http://localhost:3000";

export default function () {
  console.log(`Running smoke test against: ${BASE_URL}`);

  // 1. Health
  let res = http.get(`${BASE_URL}/health`);
  check(res, {
    "health status is 200": (r) => r.status === 200,
    "health has status ok": (r) => r.json("status") === "ok",
  });

  // 2. Categories
  res = http.get(`${BASE_URL}/api/categories`);
  check(res, {
    "categories status is 200": (r) => r.status === 200,
    "categories returns array": (r) => Array.isArray(r.json("data")),
  });

  // 3. Filter & Sort
  res = http.get(`${BASE_URL}/api/benchmark/filter-sort?minPrice=50000&maxPrice=500000&limit=10`);
  check(res, {
    "filter-sort status is 200": (r) => r.status === 200,
    "filter-sort returns items": (r) => r.json("count") > 0,
  });

  // 4. Deep Pagination
  res = http.get(`${BASE_URL}/api/benchmark/pagination-deep?page=100&limit=10`);
  check(res, {
    "pagination-deep status is 200": (r) => r.status === 200,
    "pagination-deep returns items": (r) => r.json("count") > 0,
  });

  // 5. Search Text (ILIKE)
  res = http.get(`${BASE_URL}/api/benchmark/search-text?q=Buku&limit=10`);
  check(res, {
    "search-text status is 200": (r) => r.status === 200,
  });

  // 6. Group Aggregate
  res = http.get(`${BASE_URL}/api/benchmark/group-aggregate`);
  check(res, {
    "group-aggregate status is 200": (r) => r.status === 200,
    "group-aggregate has totalGroups": (r) => r.json("totalGroups") >= 0,
  });

  // 7. CPU & Heavy JSON
  res = http.get(`${BASE_URL}/api/benchmark/cpu-json?limit=50`);
  check(res, {
    "cpu-json status is 200": (r) => r.status === 200,
    "cpu-json has transformed fields": (r) => r.json("data.0.tax") !== undefined,
  });

  // 8. Dynamic Search (POST)
  const payload = JSON.stringify({
    pagination: { page: 1, limit: 10 },
    sort: [{ field: "created_at", order: "desc" }],
  });
  res = http.post(`${BASE_URL}/api/products/search`, payload, {
    headers: { "Content-Type": "application/json" },
  });
  check(res, {
    "dynamic search status is 200": (r) => r.status === 200,
    "dynamic search has meta": (r) => r.json("meta.totalCount") !== undefined,
  });

  sleep(1);
}
