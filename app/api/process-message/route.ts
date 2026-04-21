import { NextResponse } from 'next/server'
import { ingestAndProcessMessage } from '@/lib/messages'
import { syncOneMessage } from '@/lib/neo4j-sync'
import type { Vector } from '@/lib/mock-data'

interface ProcessRequest {
  type: 'email' | 'sms' | 'call'
  sender: string
  receiver: string
  content: string
  subject?: string
  header?: string
}

/**
 * End-to-end ingest + scoring.
 * Writes to `messages`, `correlation_groups`, `rules_hits` and `alerts`
 * inside a single transaction.
 */
export async function POST(request: Request) {
  try {
    const body: ProcessRequest = await request.json()

    if (!body.type || !body.sender || !body.receiver || !body.content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const subject = body.subject
      ? (body.header ? `${body.subject} | ${body.header}` : body.subject).slice(0, 500)
      : null

    const result = await ingestAndProcessMessage({
      vector: body.type as Vector,
      sender: body.sender,
      recipient: body.receiver,
      content: body.content,
      subject,
    })

    // Fire-and-forget Neo4j projection for the Live Threat Map & Campaign Graph.
    // Don't block the response on this — if Neo4j is down we still want MySQL
    // to be the source of truth.
    void syncOneMessage({
      messageId: result.messageId,
      groupId: result.groupId,
      alertId: result.alertId ?? null,
    }).catch((err) => {
      console.error('[neo4j] post-ingest sync failed', err)
    })

    return NextResponse.json(
      {
        success: true,
        messageId: result.messageId,
        groupId: result.groupId,
        alertId: result.alertId,
        detectionResult: result.detection,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Process message error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
