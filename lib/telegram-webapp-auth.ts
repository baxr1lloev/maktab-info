import { NextRequest } from 'next/server'
import { verifyTelegramData } from '@/lib/verify'

export type TelegramWebAppUser = {
  id: string
  username?: string
  firstName?: string
  lastName?: string
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export function extractInitDataFromRequest(req: NextRequest): string | null {
  const headerValue = req.headers.get('x-telegram-init-data')?.trim()
  if (headerValue) return headerValue

  const queryValue = req.nextUrl.searchParams.get('init_data')?.trim()
  if (queryValue) return queryValue

  return null
}

export function parseTelegramUserFromInitData(
  initData: string
): TelegramWebAppUser | null {
  try {
    const params = new URLSearchParams(initData)
    const rawUser = params.get('user')
    if (!rawUser) return null

    const parsed = JSON.parse(rawUser) as {
      id?: number | string
      username?: string
      first_name?: string
      last_name?: string
    }

    if (typeof parsed.id !== 'number' && typeof parsed.id !== 'string') {
      return null
    }

    const normalizedId = String(parsed.id).trim()
    if (!normalizedId) return null

    return {
      id: normalizedId,
      username: asOptionalString(parsed.username),
      firstName: asOptionalString(parsed.first_name),
      lastName: asOptionalString(parsed.last_name),
    }
  } catch {
    return null
  }
}

export function authenticateTelegramInitData(initData: string | null): {
  ok: boolean
  error?: string
  user?: TelegramWebAppUser
} {
  const normalizedInitData = initData?.trim()
  if (!normalizedInitData) {
    return { ok: false, error: 'init_data is required' }
  }

  const isValid = verifyTelegramData(normalizedInitData, process.env.BOT_TOKEN!)
  if (!isValid) {
    return { ok: false, error: 'Unauthorized' }
  }

  const user = parseTelegramUserFromInitData(normalizedInitData)
  if (!user) {
    return { ok: false, error: 'Telegram user not found in init_data' }
  }

  return { ok: true, user }
}
