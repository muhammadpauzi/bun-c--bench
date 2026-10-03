import vine from "@vinejs/vine";

/**
 * VineJS compiled validation schemas for high-throughput HTTP endpoints.
 * Pre-compiled schemas achieve maximum performance without runtime schema interpretation.
 */

// 1. Search Query Schema (GET /api/products/search)
export const searchQuerySchema = vine.object({
  page: vine.number().positive().optional(),
  limit: vine.number().min(1).max(100).optional(),
  search: vine.string().optional(),
  name: vine.string().optional(),
  categoryId: vine.string().uuid().optional(),
  sortBy: vine.string().optional(),
  sortOrder: vine.enum(["asc", "desc"]).optional(),
});
export const searchQueryValidator = vine.compile(searchQuerySchema);

// 2. Filter & Sort Benchmark Schema (GET /api/benchmark/filter-sort)
export const filterSortBenchmarkSchema = vine.object({
  minPrice: vine.string().optional(),
  maxPrice: vine.string().optional(),
  limit: vine.number().min(1).max(100).optional(),
});
export const filterSortBenchmarkValidator = vine.compile(filterSortBenchmarkSchema);

// 3. Deep Pagination Benchmark Schema (GET /api/benchmark/pagination-deep)
export const deepPaginationSchema = vine.object({
  page: vine.number().positive().optional(),
  limit: vine.number().min(1).max(100).optional(),
});
export const deepPaginationValidator = vine.compile(deepPaginationSchema);

// 4. Search Text Benchmark Schema (GET /api/benchmark/search-text)
export const searchTextBenchmarkSchema = vine.object({
  q: vine.string().optional(),
  limit: vine.number().min(1).max(100).optional(),
});
export const searchTextBenchmarkValidator = vine.compile(searchTextBenchmarkSchema);

// 5. CPU & JSON Benchmark Schema (GET /api/benchmark/cpu-json)
export const cpuJsonBenchmarkSchema = vine.object({
  limit: vine.number().min(1).max(500).optional(),
});
export const cpuJsonBenchmarkValidator = vine.compile(cpuJsonBenchmarkSchema);
