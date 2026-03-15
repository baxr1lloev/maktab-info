import type { Complaint } from '@prisma/client'
import { bot } from '@/lib/bot'
import { getClosedChannelChatId } from '@/lib/telegram-chat'

function roleLabel(role: string): string {
  if (role === 'student') return 'Ученик'
  if (role === 'teacher') return 'Учитель'
  if (role === 'parent') return 'Родитель'
  return role
}

function shortText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}

export async function publishComplaintToClosedChannel(complaint: Complaint) {
  const closedChannelId = getClosedChannelChatId()
  const description = shortText(complaint.description, 550)

  const textLines = [
    `✅ Подтверждена заявка ${complaint.requestId}`,
    `📅 ${complaint.createdAt.toLocaleDateString('ru-RU')}`,
    `👤 ${roleLabel(complaint.role)}`,
    `📍 ${complaint.viloyat}`,
    `🏫 ${complaint.schoolName}`,
    `📋 ${complaint.category} — ${complaint.subcategory || '—'}`,
    `📝 ${description}`,
    `📞 Контакт: ${complaint.contact || '—'}`,
  ]

  if (complaint.beforeFileId) {
    await bot.telegram.sendPhoto(closedChannelId, complaint.beforeFileId, {
      caption: shortText(textLines.join('\n'), 1000),
    })
    return
  }

  await bot.telegram.sendMessage(closedChannelId, textLines.join('\n'))
}
