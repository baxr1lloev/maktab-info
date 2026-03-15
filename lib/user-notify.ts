import { bot } from '@/lib/bot'

export type ComplaintStatus = 'new' | 'pending' | 'accepted' | 'resolved' | 'rejected'

function buildUserStatusMessage(
  requestId: string,
  status: ComplaintStatus,
  comment?: string
): string | null {
  const cleanedComment = (comment ?? '').trim()

  if (status === 'resolved') {
    return `✅ Ваша заявка ${requestId} подтверждена и отправлена в закрытый канал.`
  }

  if (status === 'pending') {
    return `⏳ Заявка ${requestId} принята и взята в работу.`
  }

  if (status === 'accepted') {
    return `✅ Заявка ${requestId} подтверждена. Начислено +10 баллов.`
  }

  if (status === 'rejected') {
    return `❌ Заявка ${requestId} отклонена.${cleanedComment ? ` Причина: ${cleanedComment}` : ''}`
  }

  return null
}

export async function notifyUserAboutComplaintStatus(input: {
  telegramId: string | number
  requestId: string
  status: ComplaintStatus
  comment?: string
}) {
  const message = buildUserStatusMessage(input.requestId, input.status, input.comment)
  if (!message) return

  await bot.telegram.sendMessage(String(input.telegramId), message)
}
