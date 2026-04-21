import { NextRequest, NextResponse } from 'next/server'
import { insertMessage } from '@/lib/messages'

/** Raw-insert endpoint for a voice call transcript. */
export async function POST(request: NextRequest) {
  try {
    const { caller_phone, receiver_phone, content_text } = await request.json()

    if (!caller_phone || !receiver_phone || !content_text) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const id = await insertMessage({
      vector: 'call',
      sender: caller_phone,
      recipient: receiver_phone,
      content: content_text,
      subject: null,
    })

    return NextResponse.json(
      { message: 'Call stored successfully', id },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error storing call:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
