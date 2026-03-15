import { prisma } from '@/lib/db'

const MAX_TRUST_CREDITS = 3
const START_TRUST_CREDITS = 3

type EnsureUserInput = {
  telegramId: string
  username?: string | null
  firstName?: string | null
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

export async function ensureUser(input: EnsureUserInput) {
  const telegramId = input.telegramId.trim()
  if (!telegramId) {
    throw new Error('telegramId is required')
  }

  const username = asOptionalString(input.username)
  const firstName = asOptionalString(input.firstName)

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      ...(username ? { username } : {}),
      ...(firstName ? { firstName } : {}),
    },
    create: {
      telegramId,
      username,
      firstName,
      trustCredits: START_TRUST_CREDITS,
      balance: 0,
    },
  })

  if (user.trustCredits > MAX_TRUST_CREDITS) {
    return prisma.user.update({
      where: { id: user.id },
      data: { trustCredits: MAX_TRUST_CREDITS },
    })
  }

  return user
}

// +10 баллов при принятии заявки
export async function awardAccepted(telegramId: string): Promise<void> {
  await ensureUser({ telegramId })
  await prisma.user.update({
    where: { telegramId: telegramId.trim() },
    data: { balance: { increment: 10 } },
  })
}

// +20 баллов при закрытии с фото
export async function awardResolved(telegramId: string): Promise<void> {
  await ensureUser({ telegramId })
  await prisma.user.update({
    where: { telegramId: telegramId.trim() },
    data: { balance: { increment: 20 } },
  })
}

// -1 кредит доверия при фейке
export async function penalizeFake(telegramId: string): Promise<void> {
  const user = await ensureUser({ telegramId })
  const nextCredits = Math.max(0, Math.min(MAX_TRUST_CREDITS, user.trustCredits - 1))

  await prisma.user.update({
    where: { id: user.id },
    data: { trustCredits: nextCredits },
  })
}

export async function getUserScore(telegramId: string): Promise<{
  balance: number
  trustCredits: number
}> {
  const user = await ensureUser({ telegramId })
  return {
    balance: user.balance,
    trustCredits: Math.max(0, Math.min(MAX_TRUST_CREDITS, user.trustCredits)),
  }
}

export async function getUserStats(telegramId: string): Promise<{
  userId: number
  balance: number
  trustCredits: number
  complaintsCount: number
  resolvedCount: number
}> {
  const user = await ensureUser({ telegramId })

  const whereByUser = {
    OR: [{ userId: user.id }, { telegramId: user.telegramId }],
  }

  const [complaintsCount, resolvedCount] = await Promise.all([
    prisma.complaint.count({ where: whereByUser }),
    prisma.complaint.count({
      where: {
        ...whereByUser,
        status: 'resolved',
      },
    }),
  ])

  return {
    userId: user.id,
    balance: user.balance,
    trustCredits: Math.max(0, Math.min(MAX_TRUST_CREDITS, user.trustCredits)),
    complaintsCount,
    resolvedCount,
  }
}

// возвращает true если trustCredits <= 0
export async function isUserBlocked(telegramId: string): Promise<boolean> {
  const { trustCredits } = await getUserScore(telegramId)
  return trustCredits <= 0
}
