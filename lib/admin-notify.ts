import { Markup } from 'telegraf'
import { bot } from '@/lib/bot'
import { getModerationChatId, getReportChatId } from '@/lib/telegram-chat'
import { getAdminUserIds } from '@/lib/admin-auth'

type AdminNotificationPayload = {
  request_id?: unknown
  requestId?: unknown
  school?: unknown
  school_name?: unknown
  schoolName?: unknown
  category?: unknown
  sub?: unknown
  subcategory?: unknown
  subCategory?: unknown
  description?: unknown
  role?: unknown
  viloyat?: unknown
  priority?: unknown
  before_file_id?: unknown
  beforeFileId?: unknown
  photo_file_id?: unknown
  photoFileId?: unknown
}

function asText(value: unknown, fallback = '—'): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function asList(value: unknown): string {
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)

    return parts.length > 0 ? parts.join(', ') : '—'
  }

  return asText(value, '—')
}

function normalizePayload(body: AdminNotificationPayload) {
  const requestId = asText(body.request_id ?? body.requestId, 'REQ-UNKNOWN')
  const school = asText(body.school ?? body.school_name ?? body.schoolName)
  const category = asText(body.category)
  const subcategory = asList(body.sub ?? body.subcategory ?? body.subCategory)
  const description = asText(body.description).slice(0, 800)
  const roleRaw = asText(body.role, '').toLowerCase()
  const role =
    roleRaw === 'student'
      ? 'Ученик'
      : roleRaw === 'teacher'
        ? 'Учитель'
        : roleRaw === 'parent'
          ? 'Родитель'
          : asText(body.role)
  const viloyat = asText(body.viloyat)
  const priority = asText(body.priority, 'low').toLowerCase()
  const beforeFileId = asText(
    body.before_file_id ?? body.beforeFileId ?? body.photo_file_id ?? body.photoFileId,
    ''
  )

  return {
    requestId,
    school,
    category,
    subcategory,
    description,
    role,
    viloyat,
    priority,
    beforeFileId,
  }
}

export async function sendAdminComplaintNotification(body: AdminNotificationPayload) {
  const {
    requestId,
    school,
    category,
    subcategory,
    description,
    role,
    viloyat,
    priority,
    beforeFileId,
  } = normalizePayload(body)

  const emoji = (
    { critical: '🔴', medium: '🟡', low: '🟢' } as Record<string, string>
  )[priority] ?? '⚪'

  const text = [
    `${emoji} Новая заявка ${requestId}`,
    `👤 Роль: ${role}`,
    `📍 Регион: ${viloyat}`,
    `🏫 Школа: ${school}`,
    `📋 Категория: ${category} — ${subcategory}`,
    `📝 Описание: ${description}`,
    '🛡 Для публикации в закрытый канал нажмите «✅ Принять».',
  ].join('\n')
  const caption = text.length > 1000 ? `${text.slice(0, 997)}...` : text

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Принять', `approve_${requestId}`),
      Markup.button.callback('⏳ В работу', `pending_${requestId}`),
    ],
    [Markup.button.callback('❌ Отклонить', `reject_${requestId}`)],
  ])

  const moderationTargets = new Set<string>()
  for (const adminId of getAdminUserIds()) {
    moderationTargets.add(String(adminId))
  }

  const moderationChatId = getModerationChatId()
  if (moderationChatId) {
    moderationTargets.add(moderationChatId)
  }

  // Safe fallback so заявки не теряются при пустой конфигурации админов.
  if (moderationTargets.size === 0) {
    moderationTargets.add(getReportChatId())
  }

  await Promise.all(
    [...moderationTargets].map((chatId) =>
      (beforeFileId
        ? bot.telegram.sendPhoto(chatId, beforeFileId, {
            caption,
            ...keyboard,
          })
        : bot.telegram.sendMessage(chatId, text, keyboard)
      ).catch((error) => {
        console.error(`Failed to notify admin ${chatId}:`, error)
      })
    )
  )
}
