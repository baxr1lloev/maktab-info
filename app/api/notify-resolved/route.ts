import { NextRequest, NextResponse } from 'next/server'
import { bot } from '@/lib/bot'
import { getComplaintByRequestId } from '@/lib/db'
import { getReportChatId } from '@/lib/telegram-chat'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { request_id } = await req.json()
    const complaint = await getComplaintByRequestId(request_id)
    const reportChatId = getReportChatId()

    const days = complaint.resolvedAt
      ? Math.ceil(
          (complaint.resolvedAt.getTime() - complaint.createdAt.getTime()) / 86_400_000
        )
      : null

    const daysText = days
      ? `⏱ Исправлено за ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`
      : '⏱ Исправлено'

    // Message 1 — "before" photo
    if (complaint.beforeFileId) {
      await bot.telegram.sendPhoto(
        reportChatId,
        complaint.beforeFileId,
        {
          caption: [
            `📸 Было — ${request_id}`,
            `🏫 ${complaint.schoolName}`,
            `📋 ${complaint.category} — ${complaint.subcategory}`,
            `📅 ${complaint.createdAt.toLocaleDateString('ru-RU')}`,
          ].join('\n'),
        }
      )
    }

    // Message 2 — "after" photo
    if (complaint.afterFileId) {
      await bot.telegram.sendPhoto(
        reportChatId,
        complaint.afterFileId,
        {
          caption: [
            `✅ Стало — ${request_id}`,
            `📅 ${complaint.resolvedAt ? complaint.resolvedAt.toLocaleDateString('ru-RU') : '—'}`,
            daysText,
          ].join('\n'),
        }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Notify resolved error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
