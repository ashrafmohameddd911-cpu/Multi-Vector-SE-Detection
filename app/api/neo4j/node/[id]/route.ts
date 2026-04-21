import { NextResponse } from 'next/server'
import { readTx } from '@/lib/neo4j'

/**
 * GET /api/neo4j/node/:id
 *
 * Returns a single node (by its domain `id` property, which is what we MERGE on)
 * plus its immediate neighbours and the relationships connecting them.
 *
 * Used by the Threat Map + Campaign Graph detail drawer.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 })
  }

  try {
    const rows = await readTx<any>(
      `
      MATCH (n)
      WHERE n.id = $id OR n.name = $id OR n.type = $id OR elementId(n) = $id
      WITH n LIMIT 1
      OPTIONAL MATCH (n)-[r]-(m)
      RETURN n, collect(DISTINCT { rel: r, node: m }) AS neighbours
      `,
      { id }
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }

    const row = rows[0]
    const node = row.n
    const neighboursRaw = (row.neighbours ?? []) as {
      rel: any
      node: any
    }[]

    const neighbours = neighboursRaw
      .filter((nb) => nb && nb.node && nb.rel)
      .map((nb) => ({
        node: {
          id: String(nb.node.properties?.id ?? nb.node.properties?.name ?? nb.node.properties?.type ?? nb.node.elementId),
          labels: nb.node.labels,
          properties: nb.node.properties,
        },
        relationship: {
          id: nb.rel.elementId ?? String(nb.rel.id),
          type: nb.rel.type,
          direction:
            nb.rel.startElementId === node.elementId ? 'outgoing' : 'incoming',
          properties: nb.rel.properties,
        },
      }))

    return NextResponse.json({
      node: {
        id: String(node.properties?.id ?? node.properties?.name ?? node.properties?.type ?? node.elementId),
        labels: node.labels,
        properties: node.properties,
        elementId: node.elementId,
      },
      neighbours,
    })
  } catch (err: any) {
    console.error('[neo4j/node] failed', err)
    return NextResponse.json(
      { error: err?.message ?? 'query failed' },
      { status: 500 }
    )
  }
}
