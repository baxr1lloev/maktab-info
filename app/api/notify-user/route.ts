import { NextRequest, NextResponse } from 'next/server'
import { notifyUserAboutComplaintStatus } from '@/lib/user-notify'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { telegram_id, request_id, status, comment } = await req.json()
    const normalizedStatus = String(status).trim()
    if (
      normalizedStatus !== 'pending' &&
      normalizedStatus !== 'resolved' &&
      normalizedStatus !== 'rejected'
    ) {
      return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
    }

    await notifyUserAboutComplaintStatus({
      telegramId: String(telegram_id),
      requestId: String(request_id),
      status: normalizedStatus,
      comment: typeof comment === 'string' ? comment : undefined,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Notify user error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
