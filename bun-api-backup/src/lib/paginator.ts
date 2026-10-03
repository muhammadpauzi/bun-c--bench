import type { PaginationParams, PaginatedResult, GroupByOption, GroupedItem } from "./types";
import { logQueryExecution } from "./logger";
import { groupItems } from "./grouper";

export type ExecutableQuery<T> = PromiseLike<T> & {
  toSQL: () => { sql: string; params: unknown[] };
};

export type CountQueryResult = { total: number | string | bigint }[];

/**
 * Global DRY pagination sanitizer
 */
export function sanitizePagination(
  params?: PaginationParams,
  defaultLimit = 10,
  maxLimit = 100
) {
  const rawPage = Number(params?.page);
  const rawLimit = Number(params?.limit);

  const page = isNaN(rawPage) || rawPage < 1 ? 1 : Math.floor(rawPage);
  const limit =
    isNaN(rawLimit) || rawLimit < 1 ? defaultLimit : Math.min(maxLimit, Math.floor(rawLimit));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

export type PaginateQueryOptions<TData> = {
  dataQuery: ExecutableQuery<TData[]>;
  countQuery: ExecutableQuery<CountQueryResult>;
  page: number;
  limit: number;
  groupBy?: GroupByOption;
  enableLogging?: boolean;
};

/**
 * Global DRY paginated query executor with colored SQL logging, timing & generic grouping
 */
export async function executePaginatedQuery<TData>(
  options: PaginateQueryOptions<TData>
): Promise<PaginatedResult<TData>> {
  const { dataQuery, countQuery, page, limit, groupBy, enableLogging = true } = options;

  const dataSql = dataQuery.toSQL();
  const countSql = countQuery.toSQL();

  const overallStart = performance.now();

  // Concurrent execution using Promise.all
  const [dataResult, countResultWrapper] = await Promise.all([
    (async () => {
      const t = performance.now();
      const res = await dataQuery;
      return { data: res, timeMs: Number((performance.now() - t).toFixed(2)) };
    })(),
    (async () => {
      const t = performance.now();
      const res = await countQuery;
      return { count: res, timeMs: Number((performance.now() - t).toFixed(2)) };
    })(),
  ]);

  const data = dataResult.data;
  const dataTimeMs = dataResult.timeMs;
  const countResult = countResultWrapper.count;
  const countTimeMs = countResultWrapper.timeMs;

  const totalDbTimeMs = Number((performance.now() - overallStart).toFixed(2));
  const totalCount = Number(countResult[0]?.total ?? 0);
  const totalPages = Math.ceil(totalCount / limit);

  if (enableLogging) {
    logQueryExecution({
      dataSql,
      dataTimeMs,
      countSql,
      countTimeMs,
      totalDbTimeMs,
      totalCount,
      limit,
      page,
    });
  }

  // Apply generic grouping if requested
  let finalData: TData[] | GroupedItem<TData>[] = data;
  let totalGroups: number | undefined = undefined;

  if (groupBy) {
    const grouped = groupItems(data, groupBy);
    finalData = grouped;
    totalGroups = grouped.length;
  }

  return {
    data: finalData,
    meta: {
      page,
      limit,
      totalCount,
      totalPages,
      ...(totalGroups !== undefined ? { totalGroups } : {}),
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      executionTimeMs: totalDbTimeMs,
    },
  };
}
