import mysql from 'mysql2/promise'

/**
 * MySQL connection pool for SpiderNET.
 *
 * Prefers DATABASE_URL (e.g. mysql://root:pass@localhost:3306/se_detection).
 * Falls back to individual MYSQL_* env vars for local/dev convenience.
 *
 * The pool is cached on `globalThis` so hot-reloads in Next.js dev mode don't
 * spawn a new pool on every request.
 */

declare global {
  // eslint-disable-next-line no-var
  var __spidernet_mysql_pool: mysql.Pool | undefined
}

function createPool(): mysql.Pool {
  const url = process.env.DATABASE_URL

  if (url) {
    return mysql.createPool({
      uri: url,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: false,
      timezone: 'Z',
      supportBigNumbers: true,
      decimalNumbers: true,
    })
  }

  return mysql.createPool({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'se_detection',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: false,
    timezone: 'Z',
    supportBigNumbers: true,
    decimalNumbers: true,
  })
}

export const pool: mysql.Pool = globalThis.__spidernet_mysql_pool ?? createPool()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__spidernet_mysql_pool = pool
}

/** Convenience wrapper that returns only the rows. */
export async function query<T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const [rows] = await pool.query(sql, params)
  return rows as T[]
}

/** Run a set of statements inside a single transaction. */
export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    try {
      await conn.rollback()
    } catch {
      /* ignore rollback errors */
    }
    throw err
  } finally {
    conn.release()
  }
}
