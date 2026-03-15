import { Prisma, PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

type ComplaintInput = {
  request_id: string
  telegram_id: string | number
  user_id?: number | null
  username?: string | null
  first_name?: string | null
  role: string
  viloyat: string
  tuman?: string | null
  school_inn?: string | null
  school_name: string
  category: string
  subcategory?: string[] | string
  description: string
  contact?: string | null
  priority?: string | null
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeSubcategory(subcategory: ComplaintInput['subcategory']): string {
  if (Array.isArray(subcategory)) {
    return subcategory.join(', ')
  }

  return subcategory ?? ''
}

export async function createComplaint(data: ComplaintInput) {
  await prisma.complaint.create({
    data: {
      requestId: data.request_id,
      telegramId: String(data.telegram_id),
      userId: typeof data.user_id === 'number' ? data.user_id : null,
      role: data.role,
      viloyat: data.viloyat,
      tuman: asOptionalString(data.tuman),
      schoolInn: asOptionalString(data.school_inn),
      schoolName: data.school_name,
      category: data.category,
      subcategory: normalizeSubcategory(data.subcategory),
      description: data.description,
      contact: asOptionalString(data.contact),
      priority: asOptionalString(data.priority) ?? 'medium',
      status: 'new',
    },
  })
}

export async function updateComplaintStatus(
  requestId: string,
  status: string,
  adminComment?: string
) {
  const data: Prisma.ComplaintUpdateInput = {
    status,
    adminComment: asOptionalString(adminComment),
    updatedAt: new Date(),
  }

  if (status === 'resolved') {
    data.resolvedAt = new Date()

    const complaint = await prisma.complaint.findUnique({
      where: { requestId },
      select: { createdAt: true },
    })

    if (complaint) {
      data.daysToResolve = Math.ceil(
        (Date.now() - complaint.createdAt.getTime()) / 86_400_000
      )
    }
  } else {
    data.resolvedAt = null
    data.daysToResolve = null
  }

  await prisma.complaint.update({
    where: { requestId },
    data,
  })
}

const fileFieldMap = {
  before_file_id: 'beforeFileId',
  after_file_id: 'afterFileId',
} as const

type FileField = keyof typeof fileFieldMap

type ListComplaintsOptions = {
  status?: string
  limit?: number
}

export async function updateComplaintField(
  requestId: string,
  field: FileField,
  value: string
) {
  const dbField = fileFieldMap[field]

  await prisma.complaint.update({
    where: { requestId },
    data: { [dbField]: value } as Prisma.ComplaintUpdateInput,
  })
}

export async function getComplaintByRequestId(requestId: string) {
  const complaint = await prisma.complaint.findUnique({ where: { requestId } })

  if (!complaint) {
    throw new Error(`Complaint ${requestId} not found`)
  }

  return complaint
}

export async function listRecentComplaints(options: ListComplaintsOptions = {}) {
  const { status, limit = 10 } = options

  return prisma.complaint.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ user: { trustCredits: 'desc' } }, { createdAt: 'asc' }],
    take: Math.min(Math.max(limit, 1), 25),
    select: {
      requestId: true,
      telegramId: true,
      role: true,
      viloyat: true,
      schoolName: true,
      category: true,
      subcategory: true,
      description: true,
      status: true,
      createdAt: true,
      user: {
        select: {
          trustCredits: true,
          balance: true,
        },
      },
    },
  })
}

export async function listUserComplaintsByTelegramId(telegramId: string, limit = 20) {
  const normalizedTelegramId = telegramId.trim()
  if (!normalizedTelegramId) return []

  return prisma.complaint.findMany({
    where: {
      OR: [
        { telegramId: normalizedTelegramId },
        { user: { telegramId: normalizedTelegramId } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
    select: {
      requestId: true,
      category: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
    },
  })
}
