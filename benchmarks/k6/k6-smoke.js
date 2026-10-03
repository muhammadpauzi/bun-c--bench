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

  // 2. Categories (CRUD Read)
  res = http.get(`${BASE_URL}/api/categories`);
  check(res, {
    "categories status is 200": (r) => r.status === 200,
    "categories returns array": (r) => Array.isArray(r.json("data")),
  });

  // 3. Products Paginated List (Page 1)
  res = http.get(`${BASE_URL}/api/products?page=1&limit=10`);
  check(res, {
    "products page 1 status is 200": (r) => r.status === 200,
    "products returns items": (r) => r.json("data.length") > 0,
    "products has pagination meta": (r) => r.json("meta.totalCount") !== undefined,
  });

  const firstProdId = res.json("data.0.id");

  // 4. Products Deep Pagination
  res = http.get(`${BASE_URL}/api/products?page=100&limit=10`);
  check(res, {
    "deep pagination status is 200": (r) => r.status === 200,
    "deep pagination returns items": (r) => r.json("data.length") > 0,
  });

  // 5. Products Single Item by ID
  if (firstProdId) {
    res = http.get(`${BASE_URL}/api/products/${firstProdId}`);
    check(res, {
      "product by id status is 200": (r) => r.status === 200,
      "product has matching id": (r) => r.json("data.id") === firstProdId,
    });
  }

  sleep(1);
}
