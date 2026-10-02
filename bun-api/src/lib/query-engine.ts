import {
  SQL,
  and,
  or,
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  ilike,
  like,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  asc,
  desc,
  sql,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { FilterOperator, FilterGroup, SortOption, FieldRegistry } from "./types";

function normalizeValue(col: any, value: any): any {
  if (value === undefined || value === null) return value;

  // Handle arrays recursively (e.g. for "in" and "not_in")
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(col, item));
  }

  // If target column is date/timestamp and string format is passed, convert to Date object
  const isDateCol =
    col &&
    typeof col === "object" &&
    (col.dataType === "date" || col.columnType === "PgTimestamp" || col.columnType === "PgDate");

  if (isDateCol) {
    if (value instanceof Date) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error(`Nilai filter tanggal tidak boleh berupa string kosong.`);
      }
      const parsed = new Date(trimmed);
      if (isNaN(parsed.getTime())) {
        throw new Error(
          `Format tanggal '${value}' tidak valid. Gunakan format ISO seperti '2026-01-01T00:00:00.000Z' atau '2026-01-01'.`
        );
      }
      return parsed;
    }
  }

  return value;
}

function buildCondition(col: PgColumn | SQL, operator: FilterOperator, value: any): SQL {
  const target = col as any;
  const colType = target?.columnType;
  const isNativeText = colType === "PgText" || colType === "PgVarchar";

  // Handle null / undefined values safely in SQL
  if (value === null || value === undefined) {
    if (operator === "eq" || operator === "is_null") return isNull(target);
    if (operator === "ne" || operator === "is_not_null") return isNotNull(target);
    if (operator === "in") return inArray(target, []);
    if (operator === "not_in") return notInArray(target, []);
  }

  if (operator === "is_null") return isNull(target);
  if (operator === "is_not_null") return isNotNull(target);

  const val = normalizeValue(target, value);

  switch (operator) {
    case "eq":
      return eq(target, val);
    case "ne":
      return ne(target, val);
    case "gt":
      return gt(target, val);
    case "gte":
      return gte(target, val);
    case "lt":
      return lt(target, val);
    case "lte":
      return lte(target, val);
    case "like": {
      const pattern = `%${val}%`;
      return isNativeText ? like(target, pattern) : like(sql`cast(${target} as text)`, pattern);
    }
    case "ilike": {
      // Special optimization for products.name on short tokens (< 3 characters like "5X"):
      // Trigram pg_trgm requires at least 3 chars; for 1-2 chars Postgres falls back to a 500k row seq scan.
      // Word prefix search using to_tsvector uses the GIN FTS index in ~15ms!
      if (
        isNativeText &&
        target?.name === "name" &&
        typeof val === "string" &&
        val.trim().length > 0 &&
        val.trim().length < 3 &&
        /^[a-zA-Z0-9]+$/.test(val.trim())
      ) {
        const token = val.trim().toLowerCase();
        return sql`to_tsvector('simple', ${target}) @@ to_tsquery('simple', ${token + ':*'})`;
      }

      const pattern = `%${val}%`;
      return isNativeText ? ilike(target, pattern) : ilike(sql`cast(${target} as text)`, pattern);
    }
    case "in": {
      const arr = Array.isArray(val) ? val : [val];
      return inArray(target, arr);
    }
    case "not_in": {
      const arr = Array.isArray(val) ? val : [val];
      return notInArray(target, arr);
    }
    default:
      throw new Error(`Operator '${operator}' tidak didukung.`);
  }
}

export function resolveFilters(
  group: FilterGroup | undefined,
  registry: FieldRegistry
): SQL | undefined {
  if (!group || !group.conditions || group.conditions.length === 0) {
    return undefined;
  }

  const clauses: SQL[] = [];

  for (const cond of group.conditions) {
    // Nested recursion (AND/OR block)
    if ("conditions" in cond) {
      const nested = resolveFilters(cond, registry);
      if (nested) clauses.push(nested);
      continue;
    }

    const targetColumn = registry[cond.field];
    if (!targetColumn) {
      throw new Error(`Field '${cond.field}' tidak terdaftar atau tidak diizinkan untuk difilter.`);
    }

    clauses.push(buildCondition(targetColumn, cond.operator, cond.value));
  }

  if (clauses.length === 0) return undefined;
  return group.logic === "OR" ? or(...clauses) : and(...clauses);
}

export function resolveSorting(
  sortList: SortOption[] | undefined,
  registry: FieldRegistry,
  defaultSort: SQL = sql`id desc`
): SQL[] {
  if (!sortList || sortList.length === 0) {
    return [defaultSort];
  }

  return sortList.map((item) => {
    if (!item || !item.field) {
      throw new Error(`Item pengurutan (sort) harus memiliki properti 'field'.`);
    }
    const targetColumn = registry[item.field];
    if (!targetColumn) {
      throw new Error(`Field '${item.field}' tidak terdaftar atau tidak diizinkan untuk disortir.`);
    }
    const isAsc = String(item.order ?? "asc").toLowerCase() === "asc";
    return isAsc ? asc(targetColumn) : desc(targetColumn);
  });
}
