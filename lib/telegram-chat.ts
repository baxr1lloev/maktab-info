function getEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function normalizeChannelChatId(chatId: string): string {
  const value = chatId.trim()

  if (value.startsWith('-100')) return value
  if (value.startsWith('-')) return value
  if (/^\d+$/.test(value)) return `-100${value}`

  return value
}

export function getReportChatId(): string {
  const chatId =
    getEnv('REPORT_CHAT_ID') ??
    getEnv('ADMIN_CHAT_ID') ??
    getEnv('PHOTO_STORAGE_CHAT_ID')

  if (!chatId) {
    throw new Error(
      'Missing REPORT_CHAT_ID (or ADMIN_CHAT_ID / PHOTO_STORAGE_CHAT_ID) in environment'
    )
  }

  return chatId
}

export function getPhotoStorageChatId(): string {
  return getEnv('PHOTO_STORAGE_CHAT_ID') ?? getReportChatId()
}

export function getModerationChatId(): string | null {
  return getEnv('MODERATION_CHAT_ID')
}

export function getClosedChannelChatId(): string {
  const raw = getEnv('CLOSED_CHANNEL_CHAT_ID') ?? getReportChatId()
  return normalizeChannelChatId(raw)
}

export function sameChatId(a: string, b: string): boolean {
  return a.trim() === b.trim()
}
