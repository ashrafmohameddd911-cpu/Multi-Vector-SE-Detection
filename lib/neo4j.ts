import neo4j, { Driver, Session, Record as Neo4jRecord } from 'neo4j-driver'

/**
 * Singleton Neo4j driver for SpiderNET.
 *
 * Reads NEO4J_URI / NEO4J_USER / NEO4J_PASS / NEO4J_DATABASE from env.
 * Cached on `globalThis` so Next.js hot-reloads don't leak connections.
 */

declare global {
  // eslint-disable-next-line no-var
  var __spidernet_neo4j_driver: Driver | undefined
}

function createDriver(): Driver {
  const uri = process.env.NEO4J_URI ?? 'neo4j://127.0.0.1:7687'
  const user = process.env.NEO4J_USER ?? 'neo4j'
  const password = process.env.NEO4J_PASS ?? process.env.NEO4J_PASSWORD ?? ''

  return neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 20,
    connectionAcquisitionTimeout: 10_000,
    disableLosslessIntegers: true,
  })
}

export const driver: Driver =
  globalThis.__spidernet_neo4j_driver ?? createDriver()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__spidernet_neo4j_driver = driver
}

export const NEO4J_DATABASE = process.env.NEO4J_DATABASE ?? 'neo4j'

/** Run a read-only transaction, returning plain objects (records -> .toObject()). */
export async function readTx<T = Record<string, any>>(
  cypher: string,
  params: Record<string, any> = {}
): Promise<T[]> {
  const session: Session = driver.session({
    database: NEO4J_DATABASE,
    defaultAccessMode: neo4j.session.READ,
  })
  try {
    const res = await session.executeRead((tx) => tx.run(cypher, params))
    return res.records.map(recordToObject) as T[]
  } finally {
    await session.close()
  }
}

/** Run a write transaction. */
export async function writeTx<T = Record<string, any>>(
  cypher: string,
  params: Record<string, any> = {}
): Promise<T[]> {
  const session: Session = driver.session({
    database: NEO4J_DATABASE,
    defaultAccessMode: neo4j.session.WRITE,
  })
  try {
    const res = await session.executeWrite((tx) => tx.run(cypher, params))
    return res.records.map(recordToObject) as T[]
  } finally {
    await session.close()
  }
}

/** Run multiple write statements in a single transaction. */
export async function writeTxBatch(
  statements: { cypher: string; params?: Record<string, any> }[]
): Promise<void> {
  const session: Session = driver.session({
    database: NEO4J_DATABASE,
    defaultAccessMode: neo4j.session.WRITE,
  })
  try {
    await session.executeWrite(async (tx) => {
      for (const s of statements) {
        await tx.run(s.cypher, s.params ?? {})
      }
    })
  } finally {
    await session.close()
  }
}

/**
 * Serialise a neo4j Record into plain JS.
 * Handles Node, Relationship, temporal types (DateTime, Date, etc.), Integer, and nested structures.
 */
export function recordToObject(r: Neo4jRecord): Record<string, any> {
  const obj: Record<string, any> = {}
  for (const key of r.keys as string[]) {
    obj[key] = serialise(r.get(key))
  }
  return obj
}

export function serialise(value: any): any {
  if (value === null || value === undefined) return value

  // Neo4j Integer (only present when disableLosslessIntegers is false, but kept for safety)
  if (neo4j.isInt(value)) return value.toNumber()

  // Neo4j temporal types — convert to ISO string via their built-in toString()
  if (
    neo4j.isDateTime(value) ||
    neo4j.isLocalDateTime(value) ||
    neo4j.isDate(value) ||
    neo4j.isTime(value) ||
    neo4j.isLocalTime(value) ||
    neo4j.isDuration(value)
  ) {
    return value.toString()
  }

  if (Array.isArray(value)) return value.map(serialise)

  if (value && typeof value === 'object') {
    // Neo4j Node
    if ('labels' in value && 'properties' in value && 'elementId' in value) {
      return {
        elementId: value.elementId,
        labels: value.labels,
        properties: serialise(value.properties),
      }
    }
    // Neo4j Relationship
    if ('type' in value && 'startNodeElementId' in value && 'endNodeElementId' in value) {
      return {
        elementId: value.elementId,
        type: value.type,
        startElementId: value.startNodeElementId,
        endElementId: value.endNodeElementId,
        properties: serialise(value.properties),
      }
    }
    // Plain object / property map
    const out: Record<string, any> = {}
    for (const k of Object.keys(value)) out[k] = serialise(value[k])
    return out
  }

  return value
}
