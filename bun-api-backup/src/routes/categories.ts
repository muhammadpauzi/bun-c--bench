import { Hono } from "hono";
import { asc } from "drizzle-orm";
import { db } from "../db";
import { categories } from "../db/schema";

export const categoriesRoute = new Hono();

// GET /api/categories
categoriesRoute.get("/", async (c) => {
  const list = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
    })
    .from(categories)
    .orderBy(asc(categories.name));

  return c.json({
    success: true,
    data: list,
  });
});

// Explicit 405 Method Not Allowed for non-GET methods
categoriesRoute.all("/", (c) => {
  return c.json(
    {
      success: false,
      error: `Metode ${c.req.method} tidak didukung untuk /api/categories`,
    },
    405
  );
});
