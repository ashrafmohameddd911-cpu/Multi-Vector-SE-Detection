import { NextResponse } from 'next/server'
import { syncAll } from '@/lib/neo4j-sync'

/**
 * POST /api/neo4j/sync
 *
 * Projects the current MySQL state into Neo4j using MERGE (idempotent).
 * Safe to call repeatedly; each call writes up to the first few thousand
 * rows of each table. Returns a SyncStats object.
 */
export async function POST() {
  try {
    const stats = await syncAll()
    return NextResponse.json({ success: true, stats })
  } catch (err: any) {
    console.error('[neo4j/sync] failed', err)
    return NextResponse.json(
      { success: false, error: err?.message ?? 'sync failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  // convenience: allow triggering sync by visiting the URL in a browser
  return POST()
}
