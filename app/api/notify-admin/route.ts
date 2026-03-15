import { NextRequest, NextResponse } from 'next/server'
import { sendAdminComplaintNotification } from '@/lib/admin-notify'

export async function POST(req: NextRequest) {
  // Protect from external callers — only n8n should call this
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    await sendAdminComplaintNotification(body)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Notify admin error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
