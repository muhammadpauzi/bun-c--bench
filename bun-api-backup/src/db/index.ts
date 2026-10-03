import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/gogoskola_db";

// Inisialisasi client native Bun
export const client = new SQL(connectionString);

// Inisialisasi Drizzle dengan schema
export const db = drizzle({ client, schema });
