import { Hono } from "hono";
import { and, avg, count, desc, eq, gte, ilike, lte, max, min } from "drizzle-orm";
import { db } from "../db";
import { categories, products } from "../db/schema";
import {
  cpuJsonBenchmarkValidator,
  deepPaginationValidator,
  filterSortBenchmarkValidator,
  searchTextBenchmarkValidator,
} from "../dtos/query.dto";

export const benchmarkRoute = new Hono();

// Case 1: Filtering & Sorting (Price Range + Order by price desc)
benchmarkRoute.get("/filter-sort", async (c) => {
  const input = await filterSortBenchmarkValidator.validate(c.req.query());
  const minPrice = input.minPrice ?? "50000";
  const maxPrice = input.maxPrice ?? "500000";
  const limit = input.limit ?? 20;

  const data = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      createdAt: products.createdAt,
      category: {
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      },
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(gte(products.price, minPrice), lte(products.price, maxPrice)))
    .orderBy(desc(products.price))
    .limit(limit);

  return c.json({ success: true, count: data.length, data });
});

// Case 2: Deep Pagination (Offset stress)
benchmarkRoute.get("/pagination-deep", async (c) => {
  const input = await deepPaginationValidator.validate(c.req.query());
  const page = input.page ?? 500;
  const limit = input.limit ?? 20;
  const offset = (page - 1) * limit;

  const data = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      createdAt: products.createdAt,
    })
    .from(products)
    .orderBy(desc(products.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ success: true, page, limit, offset, count: data.length, data });
});

// Case 3: Searching (ILIKE Pattern Match)
benchmarkRoute.get("/search-text", async (c) => {
  const input = await searchTextBenchmarkValidator.validate(c.req.query());
  const q = input.q ?? "Galaxy";
  const limit = input.limit ?? 20;

  const data = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(ilike(products.name, `%${q}%`))
    .limit(limit);

  return c.json({ success: true, query: q, count: data.length, data });
});

// Case 4: Grouping & SQL Aggregation
benchmarkRoute.get("/group-aggregate", async (c) => {
  const stats = await db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      categorySlug: categories.slug,
      totalProducts: count(products.id),
      avgPrice: avg(products.price),
      minPrice: min(products.price),
      maxPrice: max(products.price),
    })
    .from(categories)
    .leftJoin(products, eq(categories.id, products.categoryId))
    .groupBy(categories.id, categories.name, categories.slug)
    .orderBy(desc(count(products.id)));

  return c.json({ success: true, totalGroups: stats.length, data: stats });
});

// Case 5: CPU Compute & Heavy JSON Serialization
benchmarkRoute.get("/cpu-json", async (c) => {
  const input = await cpuJsonBenchmarkValidator.validate(c.req.query());
  const limit = input.limit ?? 200;

  const items = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      createdAt: products.createdAt,
    })
    .from(products)
    .limit(limit);

  const now = Date.now();
  const transformed = items.map((p, idx) => {
    const numPrice = Number(p.price);
    let hash = 0;
    for (let i = 0; i < p.name.length; i++) {
      hash = (hash << 5) - hash + p.name.charCodeAt(i);
      hash |= 0;
    }
    return {
      ...p,
      tax: Number((numPrice * 0.11).toFixed(2)),
      discount: Number((numPrice * 0.05).toFixed(2)),
      finalPrice: Number((numPrice * 1.06).toFixed(2)),
      hashToken: Math.abs(hash).toString(16),
      indexKey: idx,
      timestamp: now,
    };
  });

  return c.json({ success: true, count: transformed.length, data: transformed });
});
