import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { resolveFilters, resolveSorting } from "./lib/query-engine";
import { buildDynamicProductQuery, productFieldRegistry, fetchDynamicProducts } from "./repos/product.repo";
import { createServer } from "./index";
import { groupItems, getNestedValue, normalizeGroupTarget } from "./lib/grouper";
import { sanitizePagination } from "./lib/paginator";
import type { DynamicDataQuery } from "./lib/types";

const testServer = createServer(0);

describe("Dynamic Query Engine - Filtering Operators & Edge Cases", () => {
  it("resolves basic filter conditions correctly", () => {
    const filter = {
      logic: "AND" as const,
      conditions: [
        { field: "price", operator: "gte" as const, value: 1000 },
        { field: "category.slug", operator: "eq" as const, value: "buku-pelajaran" },
      ],
    };

    const resolved = resolveFilters(filter, productFieldRegistry);
    expect(resolved).toBeDefined();

    const { dataPromise } = buildDynamicProductQuery({ filter });
    const compiled = dataPromise.toSQL();
    expect(compiled.sql).toContain('"products"."price" >= $');
    expect(compiled.sql).toContain('"categories"."slug" = $');
    expect(compiled.params).toContain(1000);
    expect(compiled.params).toContain("buku-pelajaran");
  });

  it("supports both camelCase and snake_case column aliases", () => {
    const filter = {
      conditions: [
        { field: "categoryId", operator: "eq" as const, value: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
        { field: "category_id", operator: "eq" as const, value: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
        { field: "createdAt", operator: "gte" as const, value: "2026-01-01T00:00:00.000Z" },
        { field: "created_at", operator: "gte" as const, value: "2026-01-01T00:00:00.000Z" },
        { field: "updatedAt", operator: "is_not_null" as const },
        { field: "updated_at", operator: "is_not_null" as const },
      ],
    };

    const resolved = resolveFilters(filter, productFieldRegistry);
    expect(resolved).toBeDefined();
  });

  it("handles all comparison operators: eq, ne, gt, gte, lt, lte", () => {
    const operators = ["eq", "ne", "gt", "gte", "lt", "lte"] as const;
    for (const op of operators) {
      const resolved = resolveFilters(
        {
          conditions: [{ field: "price", operator: op, value: 50000 }],
        },
        productFieldRegistry
      );
      expect(resolved).toBeDefined();
    }
  });

  it("handles text matching: like and ilike on native text columns", () => {
    const resolved = resolveFilters(
      {
        conditions: [
          { field: "name", operator: "like" as const, value: "Galaxy" },
          { field: "name", operator: "ilike" as const, value: "samsung" },
          { field: "category.name", operator: "ilike" as const, value: "gadget" },
        ],
      },
      productFieldRegistry
    );
    expect(resolved).toBeDefined();
  });

  it("safely handles like and ilike on non-text columns (numeric price & UUID id) via SQL cast", () => {
    const { dataPromise } = buildDynamicProductQuery({
      filter: {
        conditions: [
          { field: "price", operator: "ilike" as const, value: "5000" },
          { field: "id", operator: "like" as const, value: "a1b2" },
        ],
      },
    });

    const compiled = dataPromise.toSQL();
    expect(compiled.sql).toContain('cast("products"."price" as text) ilike $');
    expect(compiled.sql).toContain('cast("products"."id" as text) like $');
    expect(compiled.params).toContain("%5000%");
    expect(compiled.params).toContain("%a1b2%");
  });

  it("handles array operators: in and not_in", () => {
    const { dataPromise } = buildDynamicProductQuery({
      filter: {
        conditions: [
          { field: "category.slug", operator: "in" as const, value: ["gadget", "laptop"] },
          { field: "category.slug", operator: "not_in" as const, value: ["makanan"] },
        ],
      },
    });

    const compiled = dataPromise.toSQL();
    expect(compiled.sql).toContain('"categories"."slug" in ($1, $2)');
    expect(compiled.sql).toContain('"categories"."slug" not in ($3)');
    expect(compiled.params).toEqual(["gadget", "laptop", "makanan", 10]);
  });

  it("handles in and not_in with empty array without throwing SQL syntax errors", () => {
    const { dataPromise } = buildDynamicProductQuery({
      filter: {
        conditions: [
          { field: "category.slug", operator: "in" as const, value: [] },
          { field: "category.slug", operator: "not_in" as const, value: [] },
        ],
      },
    });

    const compiled = dataPromise.toSQL();
    expect(compiled.sql).toBeDefined();
  });

  it("handles in operator with array of date strings by normalizing each element to Date", () => {
    const { dataPromise } = buildDynamicProductQuery({
      filter: {
        conditions: [
          {
            field: "createdAt",
            operator: "in" as const,
            value: ["2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"],
          },
        ],
      },
    });

    const compiled = dataPromise.toSQL();
    expect(compiled.sql).toContain('"products"."created_at" in ($1, $2)');
    expect(compiled.params[0]).toBe("2026-01-01T00:00:00.000Z");
    expect(compiled.params[1]).toBe("2026-02-01T00:00:00.000Z");
  });

  it("handles null safety: is_null, is_not_null, and null values passed to eq/ne", () => {
    const { dataPromise } = buildDynamicProductQuery({
      filter: {
        conditions: [
          { field: "categoryId", operator: "is_null" as const },
          { field: "categoryId", operator: "is_not_null" as const },
          { field: "categoryId", operator: "eq" as const, value: null },
          { field: "categoryId", operator: "ne" as const, value: null },
        ],
      },
    });

    const compiled = dataPromise.toSQL();
    expect(compiled.sql).toContain('"products"."category_id" is null');
    expect(compiled.sql).toContain('"products"."category_id" is not null');
  });

  it("supports recursive nested AND and OR filters with exact cURL test payload", () => {
    const payload: DynamicDataQuery = {
      filter: {
        logic: "AND",
        conditions: [
          { field: "category.slug", operator: "eq", value: "buku-pelajaran" },
          { field: "price", operator: "lte", value: 150000 },
          {
            logic: "OR",
            conditions: [
              { field: "name", operator: "ilike", value: "Matematika" },
              { field: "name", operator: "ilike", value: "Fisika" },
            ],
          },
        ],
      },
      sort: [
        { field: "category.name", order: "asc" },
        { field: "price", order: "desc" },
      ],
      pagination: {
        page: 1,
        limit: 10,
      },
    };

    const { dataPromise, countPromise } = buildDynamicProductQuery(payload);
    const dataSql = dataPromise.toSQL();
    const countSql = countPromise.toSQL();

    // Verify SQL generated
    expect(dataSql.sql).toContain('left join "categories" on "products"."category_id" = "categories"."id"');
    expect(dataSql.sql).toContain('"categories"."slug" = $');
    expect(dataSql.sql).toContain('"products"."price" <= $');
    expect(dataSql.sql).toContain('"products"."name" ilike $');
    expect(dataSql.sql).toContain('order by "categories"."name" asc, "products"."price" desc');
    expect(dataSql.sql).toContain('limit $');

    // Verify params
    expect(dataSql.params).toEqual(["buku-pelajaran", 150000, "%Matematika%", "%Fisika%", 10]);

    // Count SQL (clean optimal index scan without GROUP BY)
    expect(countSql.sql).toContain('select count(*)');
    expect(countSql.sql).not.toContain('group by');
    expect(countSql.params).toEqual(["buku-pelajaran", 150000, "%Matematika%", "%Fisika%"]);
  });

  it("handles empty conditions in filter gracefully", () => {
    const resolvedEmpty = resolveFilters({ conditions: [] }, productFieldRegistry);
    expect(resolvedEmpty).toBeUndefined();

    const resolvedNestedEmpty = resolveFilters(
      {
        logic: "AND",
        conditions: [
          { logic: "OR", conditions: [] },
          { field: "name", operator: "eq", value: "Test" },
        ],
      },
      productFieldRegistry
    );
    expect(resolvedNestedEmpty).toBeDefined();
  });

  it("throws validation error for invalid date strings", () => {
    expect(() => {
      resolveFilters(
        {
          conditions: [{ field: "createdAt", operator: "gte", value: "not-a-valid-date" }],
        },
        productFieldRegistry
      );
    }).toThrow("Format tanggal 'not-a-valid-date' tidak valid");

    expect(() => {
      resolveFilters(
        {
          conditions: [{ field: "createdAt", operator: "gte", value: "   " }],
        },
        productFieldRegistry
      );
    }).toThrow("Nilai filter tanggal tidak boleh berupa string kosong");
  });

  it("throws validation error for unregistered filter fields", () => {
    expect(() => {
      resolveFilters(
        {
          conditions: [{ field: "non_existent_field", operator: "eq", value: "test" }],
        },
        productFieldRegistry
      );
    }).toThrow("Field 'non_existent_field' tidak terdaftar atau tidak diizinkan untuk difilter.");
  });

  it("throws validation error for unsupported operator", () => {
    expect(() => {
      resolveFilters(
        {
          conditions: [{ field: "name", operator: "regex_match" as any, value: ".*" }],
        },
        productFieldRegistry
      );
    }).toThrow("Operator 'regex_match' tidak didukung.");
  });
});

describe("Dynamic Sorting Engine", () => {
  it("resolves multi-column sort with case-insensitive orders", () => {
    const sortList = [
      { field: "category.name", order: "ASC" as any },
      { field: "price", order: "desc" as const },
      { field: "created_at", order: "DESC" as any },
    ];

    const clauses = resolveSorting(sortList, productFieldRegistry);
    expect(clauses.length).toBe(3);
  });

  it("falls back to default sort when sort array is empty or undefined", () => {
    const clauses = resolveSorting(undefined, productFieldRegistry, sql`id desc`);
    expect(clauses.length).toBe(1);
  });

  it("throws validation error for unregistered sort fields", () => {
    expect(() => {
      resolveSorting([{ field: "secret_column", order: "asc" }], productFieldRegistry);
    }).toThrow("Field 'secret_column' tidak terdaftar atau tidak diizinkan untuk disortir.");
  });

  it("throws validation error if sort item is missing field property", () => {
    expect(() => {
      resolveSorting([{ order: "asc" } as any], productFieldRegistry);
    }).toThrow("Item pengurutan (sort) harus memiliki properti 'field'.");
  });
});

describe("Pagination Engine", () => {
  it("sanitizes negative, zero, or NaN pagination parameters", () => {
    const p1 = sanitizePagination({ page: -5, limit: -10 });
    expect(p1.page).toBe(1);
    expect(p1.limit).toBe(10);
    expect(p1.offset).toBe(0);

    const p2 = sanitizePagination({ page: "3" as any, limit: "25" as any });
    expect(p2.page).toBe(3);
    expect(p2.limit).toBe(25);
    expect(p2.offset).toBe(50);

    const p3 = sanitizePagination({ page: NaN, limit: 1000 });
    expect(p3.page).toBe(1);
    expect(p3.limit).toBe(100); // capped at maxLimit (100)
  });
});

describe("Generic Grouping Engine with Normalization", () => {
  it("groups flat items by category with groupLabel and groupMeta", () => {
    const rawItems = [
      { id: "1", name: "Corolla", category: { id: "cat-1", name: "Toyota", slug: "toyota" } },
      { id: "2", name: "Yaris", category: { id: "cat-1", name: "Toyota", slug: "toyota" } },
      { id: "3", name: "Civic", category: { id: "cat-2", name: "Honda", slug: "honda" } },
    ];

    const grouped = groupItems(rawItems, {
      field: "category.id",
      labelField: "category.name",
      metaFields: ["category.slug"],
    });

    expect(grouped.length).toBe(2);
    expect(grouped[0]!.groupLabel).toBe("Toyota");
    expect(grouped[0]!.groupKey).toBe("cat-1");
    expect(grouped[0]!.groupMeta?.slug).toBe("toyota");
    expect(grouped[0]!.totalItems).toBe(2);
  });

  it("normalizes timestamp/date fields into day/month/year/hour groups", () => {
    const rawItems = [
      { id: "1", name: "Item A", createdAt: "2026-10-01T10:15:30.123Z" },
      { id: "2", name: "Item B", createdAt: "2026-10-01T14:45:00.000Z" },
      { id: "3", name: "Item C", createdAt: "2026-10-02T08:00:00.000Z" },
    ];

    // Group by Day
    const groupedByDay = groupItems(rawItems, { field: "createdAt", dateTrunc: "day" });
    expect(groupedByDay.length).toBe(2);
    expect(groupedByDay[0]!.groupKey).toBe("2026-10-01");
    expect(groupedByDay[0]!.totalItems).toBe(2);

    // Group by Month
    const groupedByMonth = groupItems(rawItems, { field: "createdAt", dateTrunc: "month" });
    expect(groupedByMonth.length).toBe(1);
    expect(groupedByMonth[0]!.groupKey).toBe("2026-10");
    expect(groupedByMonth[0]!.groupLabel).toBe("Oct 2026");

    // Group by Year
    const groupedByYear = groupItems(rawItems, { field: "createdAt", dateTrunc: "year" });
    expect(groupedByYear.length).toBe(1);
    expect(groupedByYear[0]!.groupKey).toBe("2026");

    // Group by Hour
    const groupedByHour = groupItems(rawItems, { field: "createdAt", dateTrunc: "hour" });
    expect(groupedByHour.length).toBe(3);
  });

  it("normalizes integer and numeric values into bucket ranges", () => {
    const rawItems = [
      { id: "1", name: "Pencil", price: 15000 },
      { id: "2", name: "Book", price: 45000 },
      { id: "3", name: "Bag", price: 120000 },
    ];

    const groupedByBucket = groupItems(rawItems, { field: "price", numberBucket: 50000 });
    expect(groupedByBucket.length).toBe(2);
    expect(groupedByBucket[0]!.groupKey).toBe("0-50000");
    expect(groupedByBucket[0]!.totalItems).toBe(2);
    expect(groupedByBucket[0]!.groupMeta?.min).toBe(0);
    expect(groupedByBucket[0]!.groupMeta?.max).toBe(50000);

    expect(groupedByBucket[1]!.groupKey).toBe("100000-150000");
    expect(groupedByBucket[1]!.totalItems).toBe(1);
  });

  it("normalizes unassigned / null values safely", () => {
    const rawItems = [
      { id: "1", name: "Product 1", category: null },
      { id: "2", name: "Product 2" },
    ];

    const grouped = groupItems(rawItems, { field: "category.id", labelField: "category.name" });
    expect(grouped.length).toBe(1);
    expect(grouped[0]!.groupKey).toBe("unassigned");
    expect(grouped[0]!.groupLabel).toBe("Unassigned");
    expect(grouped[0]!.totalItems).toBe(2);
  });

  it("handles boolean grouping safely", () => {
    const rawItems = [
      { id: "1", isAvailable: true },
      { id: "2", isAvailable: false },
      { id: "3", isAvailable: true },
    ];

    const grouped = groupItems(rawItems, { field: "isAvailable" });
    expect(grouped.length).toBe(2);
    expect(grouped[0]!.groupKey).toBe("true");
    expect(grouped[0]!.totalItems).toBe(2);
  });
});

describe("Bun HTTP Server API Endpoints", () => {
  it("handles OPTIONS preflight with CORS headers", async () => {
    const res = await testServer.fetch(
      new Request("http://localhost/api/products/search", { method: "OPTIONS" })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await testServer.fetch(new Request("http://localhost/api/unknown-endpoint"));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { message: string };
    expect(json.message).toBe("Not Found");
  });

  it("returns 405 Method Not Allowed when calling POST on /api/categories", async () => {
    const res = await testServer.fetch(
      new Request("http://localhost/api/categories", { method: "POST" })
    );
    expect(res.status).toBe(405);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
  });

  it("returns categories list on GET /api/categories", async () => {
    const res = await testServer.fetch(new Request("http://localhost/api/categories"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: any[] };
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("handles POST /api/products/search with empty body gracefully", async () => {
    const res = await testServer.fetch(
      new Request("http://localhost/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: any[]; meta: any };
    expect(json.success).toBe(true);
    expect(json.meta.page).toBe(1);
    expect(json.meta.limit).toBe(10);
  });

  it("returns 400 for invalid JSON in POST /api/products/search", async () => {
    const res = await testServer.fetch(
      new Request("http://localhost/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json-content-{{",
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain("Invalid JSON");
  });

  it("returns 400 for invalid search filter field in POST /api/products/search", async () => {
    const res = await testServer.fetch(
      new Request("http://localhost/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: {
            conditions: [{ field: "injected_col", operator: "eq", value: "foo" }],
          },
        }),
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain("tidak terdaftar");
  });

  it("returns 400 for invalid sort field in POST /api/products/search", async () => {
    const res = await testServer.fetch(
      new Request("http://localhost/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sort: [{ field: "secret_table", order: "asc" }],
        }),
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain("tidak terdaftar");
  });

  it("supports GET /api/products/search with query parameters", async () => {
    const res = await testServer.fetch(
      new Request("http://localhost/api/products/search?page=1&limit=5&search=Galaxy")
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: any[]; meta: any };
    expect(json.success).toBe(true);
    expect(json.meta.page).toBe(1);
    expect(json.meta.limit).toBe(5);
  });

  it("executes full search with dynamic filtering and grouping via POST", async () => {
    const res = await testServer.fetch(
      new Request("http://localhost/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: {
            conditions: [
              { field: "price", operator: "gte", value: 10000 },
              { field: "price", operator: "lte", value: 10000000 },
            ],
          },
          sort: [{ field: "price", order: "desc" }],
          pagination: { page: 1, limit: 10 },
          groupBy: {
            field: "category.id",
            labelField: "category.name",
            metaFields: ["category.slug"],
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: any[]; meta: any };
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.meta.totalGroups).toBeDefined();
    expect(json.meta.executionTimeMs).toBeGreaterThanOrEqual(0);
  });
});
