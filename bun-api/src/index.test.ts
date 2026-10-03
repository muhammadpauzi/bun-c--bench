import { describe, expect, it } from "bun:test";
import { createApp } from "./app";

const app = createApp();

describe("Health Check", () => {
  it("GET /health returns 200 ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.runtime).toBe("bun");
  });
});

describe("Categories CRUD", () => {
  let createdId: string;
  const uniqueSlug = `cat-test-${Date.now()}`;

  it("GET /api/categories returns array of categories", async () => {
    const res = await app.request("/api/categories");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("POST /api/categories creates a new category", async () => {
    const res = await app.request("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Kategori Test", slug: uniqueSlug }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.slug).toBe(uniqueSlug);
    createdId = json.data.id;
  });

  it("GET /api/categories/:id returns the created category", async () => {
    const res = await app.request(`/api/categories/${createdId}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(createdId);
  });

  it("PUT /api/categories/:id updates category", async () => {
    const res = await app.request(`/api/categories/${createdId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Kategori Test Updated" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Kategori Test Updated");
  });

  it("DELETE /api/categories/:id deletes category", async () => {
    const res = await app.request(`/api/categories/${createdId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});

describe("Products Full CRUD (Pagination Only)", () => {
  let createdId: string;

  it("GET /api/products returns paginated products without filter or sort params", async () => {
    const res = await app.request("/api/products?page=1&limit=5");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.meta.page).toBe(1);
    expect(json.meta.limit).toBe(5);
    expect(json.meta.totalCount).toBeGreaterThanOrEqual(0);
    expect(json.meta.totalPages).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/products creates a new product", async () => {
    const res = await app.request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Produk Test Bun",
        price: 99000,
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.name).toBe("Produk Test Bun");
    createdId = json.data.id;
  });

  it("GET /api/products/:id returns the created product", async () => {
    const res = await app.request(`/api/products/${createdId}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(createdId);
  });

  it("PUT /api/products/:id updates the product", async () => {
    const res = await app.request(`/api/products/${createdId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Produk Test Bun Updated",
        price: 88000,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Produk Test Bun Updated");
  });

  it("DELETE /api/products/:id deletes the product", async () => {
    const res = await app.request(`/api/products/${createdId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("GET /api/products/:id returns 404 after deletion", async () => {
    const res = await app.request(`/api/products/${createdId}`);
    expect(res.status).toBe(404);
  });
});
