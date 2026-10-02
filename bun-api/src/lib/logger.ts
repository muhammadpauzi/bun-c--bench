import pino from "pino";

export const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProduction ? "info" : "debug");

// 1. Production-Ready Pino Logger Instance
export const logger = pino({
  name: "gogoskola-products",
  level: logLevel,
  ...(isProduction
    ? {
        // Production: high-speed structured NDJSON for Seq/Datadog/CloudWatch
        formatters: {
          level: (label) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : {
        // Development: human-readable colored output via pino-pretty
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }),
});

// Child loggers per domain
export const dbLogger = logger.child({ module: "database" });
export const httpLogger = logger.child({ module: "http" });

// 2. ANSI Colors & Utilities for Console Formatting
export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  // Colors
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  // Bright Colors
  brightCyan: "\x1b[96m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightRed: "\x1b[91m",
  brightMagenta: "\x1b[95m",
};

/**
 * Format execution time with color coding based on latency
 */
export function formatDuration(ms: number): string {
  if (ms < 25) {
    return `${c.brightGreen}${ms.toFixed(2)} ms${c.reset}`;
  } else if (ms < 100) {
    return `${c.brightYellow}${ms.toFixed(2)} ms${c.reset}`;
  } else {
    return `${c.brightRed}${ms.toFixed(2)} ms${c.reset}`;
  }
}

/**
 * Format and highlight SQL keywords & parameters with ANSI colors
 */
export function highlightSQL(sql: string): string {
  const keywords = [
    "SELECT", "FROM", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "JOIN",
    "WHERE", "ORDER BY", "GROUP BY", "HAVING", "LIMIT", "OFFSET",
    "AND", "OR", "ON", "IN", "NOT IN", "IS NULL", "IS NOT NULL",
    "ASC", "DESC", "COUNT", "AS", "ILIKE", "LIKE", "RETURNING",
    "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE", "WITH"
  ];

  // 1. Format newlines for clean indentation on major SQL clauses
  let formatted = sql
    .replace(/\s+/g, " ")
    .replace(/\b(FROM)\b/gi, "\n   $1")
    .replace(/\b(LEFT JOIN|RIGHT JOIN|INNER JOIN|JOIN)\b/gi, "\n   $1")
    .replace(/\b(WHERE)\b/gi, "\n   $1")
    .replace(/\b(ORDER BY)\b/gi, "\n   $1")
    .replace(/\b(LIMIT)\b/gi, "\n   $1");

  // 2. Highlight keywords in bold magenta
  for (const kw of keywords) {
    const regex = new RegExp(`\\b(${kw})\\b`, "gi");
    formatted = formatted.replace(regex, (match) => `${c.bold}${c.brightMagenta}${match.toUpperCase()}${c.reset}`);
  }

  // 3. Highlight quoted identifiers ("table"."column") in bright cyan
  formatted = formatted.replace(/"([^"]+)"/g, (match) => `${c.cyan}${match}${c.reset}`);

  // 4. Highlight positional parameters ($1, $2, etc.) in bright yellow
  formatted = formatted.replace(/\$(\d+)/g, (_, num) => `${c.bold}${c.brightYellow}$${num}${c.reset}`);

  return formatted;
}

/**
 * Pretty print parameter values with syntax coloring
 */
export function formatParams(params: unknown[]): string {
  if (!params || params.length === 0) return `${c.gray}[]${c.reset}`;

  const formatted = params.map((p) => {
    if (typeof p === "string") return `${c.green}"${p}"${c.reset}`;
    if (typeof p === "number") return `${c.brightYellow}${p}${c.reset}`;
    if (typeof p === "boolean") return `${c.cyan}${p}${c.reset}`;
    if (p === null || p === undefined) return `${c.gray}${p}${c.reset}`;
    if (Array.isArray(p)) return `${c.magenta}[${p.map((x) => `"${x}"`).join(", ")}]${c.reset}`;
    return `${c.white}${JSON.stringify(p)}${c.reset}`;
  });

  return `[ ${formatted.join(`${c.gray}, ${c.reset}`)} ]`;
}

export type QueryLogDetails = {
  dataSql: { sql: string; params: unknown[] };
  dataTimeMs: number;
  countSql: { sql: string; params: unknown[] };
  countTimeMs: number;
  totalDbTimeMs: number;
  totalCount: number;
  limit: number;
  page: number;
};

/**
 * Unified Query Logger: writes structured log to Pino & prints visual box in development
 */
export function logQueryExecution(details: QueryLogDetails): void {
  // 1. Structured log for production monitoring (Pino)
  dbLogger.info(
    {
      operation: "paginated_search",
      totalDbTimeMs: details.totalDbTimeMs,
      totalCount: details.totalCount,
      page: details.page,
      limit: details.limit,
      dataQuery: {
        sql: details.dataSql.sql,
        params: details.dataSql.params,
        durationMs: details.dataTimeMs,
      },
      countQuery: {
        sql: details.countSql.sql,
        params: details.countSql.params,
        durationMs: details.countTimeMs,
      },
    },
    `Executed paginated query in ${details.totalDbTimeMs}ms (found ${details.totalCount} items)`
  );

  // 2. In development mode, additionally render pretty syntax-highlighted box for terminal developer DX
  if (!isProduction) {
    const line = `${c.gray}─────────────────────────────────────────────────────────────${c.reset}`;
    const timestamp = `${c.gray}${new Date().toLocaleTimeString()} (UTC ${new Date().toISOString()})${c.reset}`;

    console.log(`\n${c.cyan}┌── ⏱️  DATABASE QUERY EXECUTION REPORT ───────────────────────┐${c.reset}`);
    console.log(`│ ${c.bold}Timestamp${c.reset} : ${timestamp}`);
    console.log(`│ ${c.bold}Stats${c.reset}     : Total DB Time: ${formatDuration(details.totalDbTimeMs)} | Found: ${c.brightGreen}${details.totalCount.toLocaleString()}${c.reset} items | Page: ${c.yellow}${details.page}${c.reset} (Limit ${details.limit})`);
    console.log(line);

    // Data Query
    console.log(` ${c.bold}${c.brightCyan}[1] DATA QUERY${c.reset} (${formatDuration(details.dataTimeMs)})`);
    console.log(`   ${highlightSQL(details.dataSql.sql)}`);
    console.log(`   ${c.bold}${c.dim}Params:${c.reset} ${formatParams(details.dataSql.params)}`);
    console.log(line);

    // Count Query
    console.log(` ${c.bold}${c.brightCyan}[2] COUNT QUERY${c.reset} (${formatDuration(details.countTimeMs)})`);
    console.log(`   ${highlightSQL(details.countSql.sql)}`);
    console.log(`   ${c.bold}${c.dim}Params:${c.reset} ${formatParams(details.countSql.params)}`);
    console.log(`${c.cyan}└─────────────────────────────────────────────────────────────┘${c.reset}\n`);
  }
}
