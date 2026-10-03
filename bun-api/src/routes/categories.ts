import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { categories } from "../db/schema";

export const categoriesRoute = new Hono();

// GET /api/categories - List all categories
categoriesRoute.get("/", async (c) => {
  const list = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      createdAt: categories.createdAt,
    })
    .from(categories)
    .orderBy(asc(categories.name));

  return c.json({
    success: true,
    data: list,
  });
});

// GET /api/categories/:id - Get category by ID
categoriesRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [category] = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      createdAt: categories.createdAt,
    })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  if (!category) {
    return c.json({ success: false, message: "Category not found" }, 404);
  }

  return c.json({
    success: true,
    data: category,
  });
});

// POST /api/categories - Create category
categoriesRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { name, slug } = body;

  if (!name || !slug) {
    return c.json(
      { success: false, message: "Name and slug are required" },
      400
    );
  }

  const [newCategory] = await db
    .insert(categories)
    .values({ name, slug })
    .returning({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      createdAt: categories.createdAt,
    });

  return c.json(
    {
      success: true,
      message: "Category created successfully",
      data: newCategory,
    },
    201
  );
});

// PUT /api/categories/:id - Update category
categoriesRoute.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { name, slug } = body;

  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (slug !== undefined) updateData.slug = slug;

  if (Object.keys(updateData).length === 0) {
    return c.json({ success: false, message: "No data provided to update" }, 400);
  }

  const [updatedCategory] = await db
    .update(categories)
    .set(updateData)
    .where(eq(categories.id, id))
    .returning({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      createdAt: categories.createdAt,
    });

  if (!updatedCategory) {
    return c.json({ success: false, message: "Category not found" }, 404);
  }

  return c.json({
    success: true,
    message: "Category updated successfully",
    data: updatedCategory,
  });
});

// DELETE /api/categories/:id - Delete category
categoriesRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [deletedCategory] = await db
    .delete(categories)
    .where(eq(categories.id, id))
    .returning({ id: categories.id });

  if (!deletedCategory) {
    return c.json({ success: false, message: "Category not found" }, 404);
  }

  return c.json({
    success: true,
    message: "Category deleted successfully",
  });
});
