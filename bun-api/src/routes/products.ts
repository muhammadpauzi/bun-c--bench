import { Hono } from "hono";
import { fetchDynamicProducts } from "../repos/product.repo";
import type { DynamicDataQuery } from "../lib/types";
import { searchQueryValidator } from "../dtos/query.dto";

export const productsRoute = new Hono();

async function executeSearch(c: any, query: DynamicDataQuery) {
  const result = await fetchDynamicProducts(query);
  return c.json({
    success: true,
    ...result,
  });
}

// GET /api/products/search (Query parameters validated with VineJS)
productsRoute.get("/search", async (c) => {
  const input = await searchQueryValidator.validate(c.req.query());
  const page = input.page ?? 1;
  const limit = input.limit ?? 10;
  const keyword = input.search || input.name;
  const categoryId = input.categoryId;
  const sortBy = input.sortBy;
  const sortOrder = input.sortOrder ?? "desc";

  const conditions: any[] = [];
  if (keyword) conditions.push({ field: "name", operator: "ilike", value: keyword });
  if (categoryId) conditions.push({ field: "categoryId", operator: "eq", value: categoryId });

  const queryPayload: DynamicDataQuery = {
    pagination: { page, limit },
    filter: conditions.length > 0 ? { logic: "AND", conditions } : undefined,
    sort: sortBy ? [{ field: sortBy, order: sortOrder }] : undefined,
  };

  return executeSearch(c, queryPayload);
});

// POST /api/products/search (Direct JSON payload)
productsRoute.post("/search", async (c) => {
  let body: DynamicDataQuery = {};
  const rawText = await c.req.text();

  if (rawText && rawText.trim()) {
    try {
      body = JSON.parse(rawText) as DynamicDataQuery;
    } catch {
      return c.json({ success: false, error: "Invalid JSON format in request body." }, 400);
    }
  }

  return executeSearch(c, body);
});
