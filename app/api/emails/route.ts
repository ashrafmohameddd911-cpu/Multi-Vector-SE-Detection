import { NextRequest, NextResponse } from 'next/server'
import { insertMessage } from '@/lib/messages'

/**
 * Raw-insert endpoint for an email message.
 * Writes to the unified `messages` table with vector_type='email'
 * and status='pending'. Scoring happens in /api/process-message.
 *
 * The `header` and `subject` fields are concatenated into the
 * `messages.subject` column (max 500 chars) since the new schema
 * does not carry a dedicated `header` column.
 */
export async function POST(request: NextRequest) {
  try {
    const { header, subject, sender_email, receiver_email, text_content } =
      await request.json()

    if (!header || !subject || !sender_email || !receiver_email || !text_content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const combinedSubject = `${subject} | ${header}`.slice(0, 500)

    const id = await insertMessage({
      vector: 'email',
      sender: sender_email,
      recipient: receiver_email,
      content: text_content,
      subject: combinedSubject,
    })

    return NextResponse.json(
      { message: 'Email stored successfully', id },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error storing email:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
