import { NextRequest, NextResponse } from 'next/server'
import { insertMessage } from '@/lib/messages'

/** Raw-insert endpoint for an SMS message. */
export async function POST(request: NextRequest) {
  try {
    const { sender_phone, receiver_phone, text_content } = await request.json()

    if (!sender_phone || !receiver_phone || !text_content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const id = await insertMessage({
      vector: 'sms',
      sender: sender_phone,
      recipient: receiver_phone,
      content: text_content,
      subject: null,
    })

    return NextResponse.json(
      { message: 'SMS stored successfully', id },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error storing SMS:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
