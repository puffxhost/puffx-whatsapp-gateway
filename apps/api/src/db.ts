import pg from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";
const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: 30_000,
});
export async function migrate() {
  const sql = await readFile(
    path.resolve("database/migrations/001_init.sql"),
    "utf8",
  );
  await pool.query(sql);
}
export async function audit(
  userId: string | undefined,
  action: string,
  resourceId: string | undefined,
  ip?: string,
) {
  await pool.query(
    "INSERT INTO audit_logs(user_id,action,resource_id,ip) VALUES($1,$2,$3,$4)",
    [userId ?? null, action, resourceId ?? null, ip ?? null],
  );
}
