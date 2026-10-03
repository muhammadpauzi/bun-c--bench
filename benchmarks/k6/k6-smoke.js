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

  // 2. Categories - List (Read)
  res = http.get(`${BASE_URL}/api/categories`);
  check(res, {
    "categories read status is 200": (r) => r.status === 200,
    "categories returns array": (r) => Array.isArray(r.json("data")),
  });

  // 3. Categories - INSERT (Create)
  const catSlug = `smoke-cat-${Date.now()}`;
  res = http.post(
    `${BASE_URL}/api/categories`,
    JSON.stringify({ name: "Smoke Category", slug: catSlug }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, {
    "category insert status is 201": (r) => r.status === 201,
    "category insert has id": (r) => r.json("data.id") !== undefined,
  });
  const createdCatId = res.json("data.id");

  // 4. Categories - UPDATE
  if (createdCatId) {
    res = http.put(
      `${BASE_URL}/api/categories/${createdCatId}`,
      JSON.stringify({ name: "Smoke Category Updated" }),
      { headers: { "Content-Type": "application/json" } }
    );
    check(res, {
      "category update status is 200": (r) => r.status === 200,
      "category update verified": (r) => r.json("data.name") === "Smoke Category Updated",
    });
  }

  // 5. Products - List (Read Paginated)
  res = http.get(`${BASE_URL}/api/products?page=1&limit=10`);
  check(res, {
    "products page 1 status is 200": (r) => r.status === 200,
    "products returns items": (r) => Array.isArray(r.json("data")) && r.json("data").length > 0,
    "products has pagination meta": (r) => r.json("meta.totalCount") !== undefined,
  });

  // 6. Products - Deep Pagination
  res = http.get(`${BASE_URL}/api/products?page=100&limit=10`);
  check(res, {
    "deep pagination status is 200": (r) => r.status === 200,
    "deep pagination returns items": (r) => Array.isArray(r.json("data")) && r.json("data").length > 0,
  });

  // 7. Products - INSERT (Create)
  res = http.post(
    `${BASE_URL}/api/products`,
    JSON.stringify({
      name: "Smoke Product Test",
      price: 199000.00,
      categoryId: createdCatId,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, {
    "product insert status is 201": (r) => r.status === 201,
    "product insert has id": (r) => r.json("data.id") !== undefined,
  });
  const createdProdId = res.json("data.id");

  // 8. Products - Read by ID
  if (createdProdId) {
    res = http.get(`${BASE_URL}/api/products/${createdProdId}`);
    check(res, {
      "product by id status is 200": (r) => r.status === 200,
      "product has matching id": (r) => r.json("data.id") === createdProdId,
    });

    // 9. Products - UPDATE
    res = http.put(
      `${BASE_URL}/api/products/${createdProdId}`,
      JSON.stringify({
        name: "Smoke Product Test Updated",
        price: 179000.00,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
    check(res, {
      "product update status is 200": (r) => r.status === 200,
      "product update verified": (r) => r.json("data.name") === "Smoke Product Test Updated",
    });

    // 10. Products - DELETE
    res = http.del(`${BASE_URL}/api/products/${createdProdId}`);
    check(res, {
      "product delete status is 200": (r) => r.status === 200,
    });
  }

  // 11. Categories - DELETE
  if (createdCatId) {
    res = http.del(`${BASE_URL}/api/categories/${createdCatId}`);
    check(res, {
      "category delete status is 200": (r) => r.status === 200,
    });
  }

  sleep(1);
}
