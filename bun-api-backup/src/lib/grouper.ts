import type { GroupByOption, GroupDateGranularity, GroupedItem } from "./types";

/**
 * Safely extracts nested property from object using dot notation (e.g. "category.name")
 */
export function getNestedValue(obj: any, path: string): any {
  if (!obj || typeof obj !== "object") return undefined;
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

/**
 * Check if a value is a Date object or valid ISO date string
 */
function isDateLike(val: any): val is Date | string {
  if (val instanceof Date) return !isNaN(val.getTime());
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    return !isNaN(Date.parse(val));
  }
  return false;
}

/**
 * Normalizes timestamp into truncated date key & human readable label
 */
function formatDateTrunc(
  dateInput: Date | string,
  granularity: GroupDateGranularity = "day"
): { key: string; label: string; meta: Record<string, any> } {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const monthName = monthNames[d.getUTCMonth()] || m;

  switch (granularity) {
    case "year":
      return {
        key: `${y}`,
        label: `${y}`,
        meta: { year: y, granularity },
      };
    case "month":
      return {
        key: `${y}-${m}`,
        label: `${monthName} ${y}`,
        meta: { year: y, month: Number(m), granularity },
      };
    case "hour":
      return {
        key: `${y}-${m}-${day}T${h}:00`,
        label: `${day} ${monthName} ${y} ${h}:00 UTC`,
        meta: { year: y, month: Number(m), day: Number(day), hour: Number(h), granularity },
      };
    case "day":
    default:
      return {
        key: `${y}-${m}-${day}`,
        label: `${day} ${monthName} ${y}`,
        meta: { year: y, month: Number(m), day: Number(day), granularity: "day" },
      };
  }
}

/**
 * Normalizes numeric value into bucket range or integer
 */
function formatNumberValue(
  val: number | string,
  option: GroupByOption
): { key: string; label: string; meta?: Record<string, any> } {
  const num = typeof val === "number" ? val : parseFloat(val);

  if (isNaN(num)) {
    return { key: String(val), label: String(val) };
  }

  // Bucket grouping (e.g. 50000 -> 0-50000, 50000-100000)
  if (option.numberBucket && option.numberBucket > 0) {
    const bucket = option.numberBucket;
    const min = Math.floor(num / bucket) * bucket;
    const max = min + bucket;
    return {
      key: `${min}-${max}`,
      label: `${min.toLocaleString()} - ${max.toLocaleString()}`,
      meta: { min, max, bucketMin: min, bucketMax: max, bucketSize: bucket },
    };
  }

  // Integer rounding
  if (option.roundToInteger || Number.isInteger(num)) {
    const intVal = Math.round(num);
    return {
      key: String(intVal),
      label: intVal.toLocaleString(),
      meta: { isInteger: true },
    };
  }

  return {
    key: String(num),
    label: num.toLocaleString(),
  };
}

/**
 * Normalizes raw property value into standardized groupKey, groupLabel, and metadata
 */
export function normalizeGroupTarget(
  rawKey: any,
  rawLabel: any,
  option: GroupByOption
): { groupKey: string; groupLabel: string; extraMeta?: Record<string, any> } {
  // 1. Handle Null / Undefined / Empty
  if (rawKey == null || rawKey === "") {
    return {
      groupKey: "unassigned",
      groupLabel: "Unassigned",
    };
  }

  // 2. Handle Date / Timestamp
  if (option.dateTrunc || isDateLike(rawKey)) {
    const { key, label, meta } = formatDateTrunc(rawKey, option.dateTrunc || "day");
    return {
      groupKey: key,
      groupLabel: rawLabel && rawLabel !== rawKey ? String(rawLabel) : label,
      extraMeta: meta,
    };
  }

  // 3. Handle Boolean
  if (typeof rawKey === "boolean") {
    return {
      groupKey: rawKey ? "true" : "false",
      groupLabel: rawKey ? "True" : "False",
    };
  }

  // 4. Handle Numbers / Integers (or numeric strings)
  if (
    typeof rawKey === "number" ||
    (option.numberBucket || option.roundToInteger) &&
    typeof rawKey === "string" &&
    !isNaN(Number(rawKey))
  ) {
    const { key, label, meta } = formatNumberValue(rawKey, option);
    return {
      groupKey: key,
      groupLabel: rawLabel && rawLabel !== rawKey ? String(rawLabel) : label,
      extraMeta: meta,
    };
  }

  // 5. Default String / UUID / Identifier
  const strKey = String(rawKey);
  const strLabel = rawLabel != null ? String(rawLabel) : strKey;
  return {
    groupKey: strKey,
    groupLabel: strLabel,
  };
}

/**
 * Generic Grouping Engine with Type Normalization:
 * Groups an array of objects into structured { groupKey, groupLabel, groupMeta, totalItems, items: [] }
 * Automatically normalizes timestamps, dates, integers, buckets, and booleans.
 */
export function groupItems<T>(items: T[], option: GroupByOption): GroupedItem<T>[] {
  const groupsMap = new Map<string, GroupedItem<T>>();

  for (const item of items) {
    const rawKey = getNestedValue(item, option.field);
    const rawLabel = option.labelField ? getNestedValue(item, option.labelField) : rawKey;

    // Apply normalization to key, label, and metadata
    const { groupKey, groupLabel, extraMeta } = normalizeGroupTarget(rawKey, rawLabel, option);

    let group = groupsMap.get(groupKey);
    if (!group) {
      // Resolve optional groupMeta (groupDll)
      let groupMeta: Record<string, any> | undefined = extraMeta ? { ...extraMeta } : undefined;
      if (option.metaFields && option.metaFields.length > 0) {
        groupMeta = groupMeta || {};
        for (const metaPath of option.metaFields) {
          const cleanKey = metaPath.includes(".") ? metaPath.split(".").pop()! : metaPath;
          groupMeta[cleanKey] = getNestedValue(item, metaPath);
        }
      }

      group = {
        groupKey,
        groupLabel,
        ...(groupMeta ? { groupMeta } : {}),
        totalItems: 0,
        items: [],
      };

      groupsMap.set(groupKey, group);
    }

    group.items.push(item);
    group.totalItems++;
  }

  return Array.from(groupsMap.values());
}
