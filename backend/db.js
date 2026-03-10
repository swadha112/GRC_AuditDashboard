// backend/db.js
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || "auditDashboard",
});
// small helper
export async function q(text, params) {
  const res = await pool.query(text, params);
  return res;
} 

/* import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not set. DB features will fail.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function q(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
} */