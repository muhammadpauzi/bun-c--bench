import { count, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { products, categories } from "../db/schema";
import type { DynamicDataQuery, FieldRegistry } from "../lib/types";
import { resolveFilters, resolveSorting } from "../lib/query-engine";
import { sanitizePagination, executePaginatedQuery } from "../lib/paginator";

// Whitelist kolom yang bisa difilter & disortir (Aman dari manipulasi nama field)
export const productFieldRegistry: FieldRegistry = {
  id: products.id,
  name: products.name,
  price: products.price,
  createdAt: products.createdAt,
  created_at: products.createdAt,
  updatedAt: products.updatedAt,
  updated_at: products.updatedAt,
  categoryId: products.categoryId, // Direct column filter for Admin Panel
  category_id: products.categoryId,
  "category.id": categories.id,
  "category.name": categories.name,
  "category.slug": categories.slug,
  "category.createdAt": categories.createdAt,
  "category.created_at": categories.createdAt,
};

function hasCategoryFilter(filterGroup: any): boolean {
  if (!filterGroup || !filterGroup.conditions) return false;
  return filterGroup.conditions.some((c: any) => {
    if ("conditions" in c) return hasCategoryFilter(c);
    return typeof c.field === "string" && c.field.startsWith("category.");
  });
}

export function buildDynamicProductQuery(params: DynamicDataQuery) {
  const { filter, sort, pagination, groupBy } = params;
  const { page, limit, offset } = sanitizePagination(pagination);

  // If grouping is requested, ensure sorting groups together
  let effectiveSort = sort ? [...sort] : [];
  if (groupBy) {
    const groupSortField = groupBy.labelField || groupBy.field;
    if (
      productFieldRegistry[groupSortField] &&
      !effectiveSort.some((s) => s.field === groupSortField)
    ) {
      effectiveSort.unshift({ field: groupSortField, order: "asc" });
    }
  }

  // 1. Resolve Dynamic Clauses
  const whereClause = resolveFilters(filter, productFieldRegistry);
  const orderByClauses = resolveSorting(
    effectiveSort.length ? effectiveSort : undefined,
    productFieldRegistry,
    sql`${products.createdAt} desc`
  );

  // 2. Base Select Data Query dengan Nested Mapping
  const dataQuery = db
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
    .where(whereClause)
    .orderBy(...orderByClauses)
    .limit(limit)
    .offset(offset);

  // 3. Count Query Efisien tanpa GROUP BY dan tanpa JOIN berlebih jika filter tidak menyentuh kategori
  const needsCategoryJoin = hasCategoryFilter(filter);
  const countQuery = needsCategoryJoin
    ? db
        .select({ total: count() })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(whereClause)
    : db
        .select({ total: count() })
        .from(products)
        .where(whereClause);

  return {
    dataQuery,
    countQuery,
    page,
    limit,
    offset,
    // Backward compatibility aliases
    dataPromise: dataQuery,
    countPromise: countQuery,
  };
}

export async function fetchDynamicProducts(params: DynamicDataQuery) {
  const { dataQuery, countQuery, page, limit } = buildDynamicProductQuery(params);
  return executePaginatedQuery({
    dataQuery,
    countQuery,
    page,
    limit,
    groupBy: params.groupBy,
  });
}
