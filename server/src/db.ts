import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[pg pool error]', err);
});

export async function query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
  const res = await pool.query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount || 0 };
}

export async function one<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const { rows } = await query<T>(text, params);
  return rows[0] || null;
}
