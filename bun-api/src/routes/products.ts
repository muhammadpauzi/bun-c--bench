import { Hono } from "hono";
import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { products, categories } from "../db/schema";

export const productsRoute = new Hono();

// GET /api/products - Paginated list (no filter, search, or sorting)
productsRoute.get("/", async (c) => {
  const query = c.req.query();
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const offset = (page - 1) * limit;

  // Run data query and count query in parallel
  const [items, [totalResult]] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        category: {
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
        },
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .orderBy(desc(products.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(products),
  ]);

  const totalCount = Number(totalResult?.count ?? 0);
  const totalPages = Math.ceil(totalCount / limit);

  return c.json({
    success: true,
    data: items,
    meta: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
});

// GET /api/products/:id - Get single product by ID
productsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [item] = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      category: {
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      },
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);

  if (!item) {
    return c.json({ success: false, message: "Product not found" }, 404);
  }

  return c.json({
    success: true,
    data: item,
  });
});

// POST /api/products - Create product
productsRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { name, price, categoryId } = body;

  if (!name || price === undefined) {
    return c.json(
      { success: false, message: "Name and price are required" },
      400
    );
  }

  const [newProduct] = await db
    .insert(products)
    .values({
      name,
      price: String(price),
      categoryId: categoryId || null,
    })
    .returning();

  return c.json(
    {
      success: true,
      message: "Product created successfully",
      data: newProduct,
    },
    201
  );
});

// PUT /api/products/:id - Update product
productsRoute.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { name, price, categoryId } = body;

  const updateData: Record<string, any> = {
    updatedAt: sql`NOW()`,
  };

  if (name !== undefined) updateData.name = name;
  if (price !== undefined) updateData.price = String(price);
  if (categoryId !== undefined) updateData.categoryId = categoryId || null;

  const [updatedProduct] = await db
    .update(products)
    .set(updateData)
    .where(eq(products.id, id))
    .returning();

  if (!updatedProduct) {
    return c.json({ success: false, message: "Product not found" }, 404);
  }

  return c.json({
    success: true,
    message: "Product updated successfully",
    data: updatedProduct,
  });
});

// DELETE /api/products/:id - Delete product
productsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const [deletedProduct] = await db
    .delete(products)
    .where(eq(products.id, id))
    .returning({ id: products.id });

  if (!deletedProduct) {
    return c.json({ success: false, message: "Product not found" }, 404);
  }

  return c.json({
    success: true,
    message: "Product deleted successfully",
  });
});
