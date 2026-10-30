import "dotenv/config";
import { migrate, pool } from "./db.js";

try {
  await migrate();
  console.log("Database schema is current");
} finally {
  await pool.end();
}
