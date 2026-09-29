import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export type Database = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  one<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | undefined>;
  execute(sql: string, params?: unknown[]): Promise<void>;
};
let pool: pg.Pool | undefined;
let local: PGlite | undefined;
export const isProduction = () =>
  process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true';
function backend() {
  if (process.env.DATABASE_URL)
    return (pool ??= new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
    }));
  if (isProduction())
    throw new Error('DATABASE_URL is required in production.');
  if (!local) {
    const path = process.env.PGLITE_PATH || resolve('.data/postgres');
    if (path !== 'memory://')
      mkdirSync(dirname(resolve(path)), { recursive: true });
    local = new PGlite(path);
  }
  return local;
}
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = backend();
  return (
    await (db instanceof PGlite ? db.query(sql, params) : db.query(sql, params))
  ).rows as T[];
}
export async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await query<T>(sql, params))[0];
}
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await query(sql, params);
}
function adapter(
  run: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>,
): Database {
  const query = async <T>(sql: string, params: unknown[] = []) =>
    (await run(sql, params)).rows as T[];
  return {
    query,
    one: async <T>(sql: string, params: unknown[] = []) =>
      (await query<T>(sql, params))[0],
    execute: async (sql, params = []) => {
      await query(sql, params);
    },
  };
}
export async function transaction<T>(
  callback: (db: Database) => Promise<T>,
): Promise<T> {
  const db = backend();
  if (db instanceof PGlite)
    return db.transaction((tx) =>
      callback(adapter((sql, params) => tx.query(sql, params))),
    );
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const value = await callback(
      adapter((sql, params) => client.query(sql, params)),
    );
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function migrate() {
  await execute(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  for (const file of (await readdir(resolve('migrations')))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort()) {
    await transaction(async (db) => {
      await db.execute('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
      if (
        await db.one('SELECT name FROM schema_migrations WHERE name=$1', [file])
      )
        return;
      const sql = await readFile(resolve('migrations', file), 'utf8');
      // Migrations contain no procedural SQL; splitting keeps PGlite and pg on the same parameterized API.
      for (const statement of sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await db.execute(statement);
      await db.execute('INSERT INTO schema_migrations(name) VALUES($1)', [
        file,
      ]);
    });
  }
}
export async function closeDb() {
  if (pool) await pool.end();
  if (local) await local.close();
  pool = undefined;
  local = undefined;
}
