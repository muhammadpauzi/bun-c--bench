import type { SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "in"
  | "not_in"
  | "is_null"
  | "is_not_null";

export type SingleFilter = {
  field: string;
  operator: FilterOperator;
  value?: any;
};

export type FilterGroup = {
  logic?: "AND" | "OR";
  conditions: (SingleFilter | FilterGroup)[];
};

export type SortOrder = "asc" | "desc";

export type SortOption = {
  field: string;
  order: SortOrder;
};

export type PaginationParams = {
  page?: number;
  limit?: number;
};

export type GroupDateGranularity = "year" | "month" | "day" | "hour";

export type GroupByOption = {
  field: string; // e.g. "category.id", "categoryId", "createdAt", "price"
  labelField?: string; // e.g. "category.name"
  metaFields?: string[]; // e.g. ["category.slug"]
  dateTrunc?: GroupDateGranularity; // Normalisasi tanggal: "day" (default), "month", "year", "hour"
  numberBucket?: number; // Normalisasi angka ke bucket range (misal 50000: 0-50rb, 50rb-100rb)
  roundToInteger?: boolean; // Normalisasi numeric float ke integer
};

export type DynamicDataQuery = {
  filter?: FilterGroup;
  sort?: SortOption[];
  pagination?: PaginationParams;
  groupBy?: GroupByOption;
};

export type FieldRegistry = Record<string, PgColumn | SQL>;

export type PaginationMeta = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  totalGroups?: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  executionTimeMs: number;
};

export type GroupedItem<T> = {
  groupKey: string;
  groupLabel: string;
  groupMeta?: Record<string, any>;
  totalItems: number;
  items: T[];
};

export type PaginatedResult<T> = {
  data: T[] | GroupedItem<T>[];
  meta: PaginationMeta;
};
