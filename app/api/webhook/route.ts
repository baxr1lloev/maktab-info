import { NextRequest, NextResponse } from 'next/server'
import { verifyTelegramData } from '@/lib/verify'
import { createComplaint } from '@/lib/db'
import axios from 'axios'
import { sendAdminComplaintNotification } from '@/lib/admin-notify'
import { findSchoolByInn, findSchoolByUid } from '@/lib/school-directory'

function isN8nForwardEnabled(): boolean {
  return (
    process.env.ENABLE_N8N_WEBHOOK === 'true' &&
    Boolean(process.env.N8N_WEBHOOK_URL?.trim())
  )
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes'
  }
  return false
}

function normalizeRole(value: unknown): 'student' | 'teacher' | 'parent' {
  const normalized = asOptionalString(value)?.toLowerCase()
  if (normalized === 'teacher') return 'teacher'
  if (normalized === 'parent') return 'parent'
  return 'student'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const initData = asOptionalString(body?.init_data) ?? ''

    // Server-side verification of Telegram initData (HMAC)
    const isValid = verifyTelegramData(initData, process.env.BOT_TOKEN!)
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const schoolUid = asOptionalString(body?.school_uid)
    const schoolInn = asOptionalString(body?.school_inn)
    const hasPhoto = asBoolean(body?.has_photo)
    const schoolFromDirectory =
      (schoolUid ? findSchoolByUid(schoolUid) : null) ??
      (schoolInn ? findSchoolByInn(schoolInn) : null)

    const schoolName =
      schoolFromDirectory?.obekt_nomi ?? asOptionalString(body?.school_name)
    const viloyat = schoolFromDirectory?.viloyat ?? asOptionalString(body?.viloyat)
    const tuman = schoolFromDirectory?.tuman ?? asOptionalString(body?.tuman)
    const category = asOptionalString(body?.category)
    const description = asOptionalString(body?.description)
    const normalizedSubcategory = Array.isArray(body?.subcategory)
      ? body.subcategory
      : asOptionalString(body?.subcategory)
        ? [asOptionalString(body?.subcategory)!]
        : []

    if (!schoolName || !viloyat || !category || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: viloyat, school_name, category, description' },
        { status: 400 }
      )
    }

    const requestId = `REQ-${Date.now().toString().slice(-4)}`
    const payload = {
      request_id: requestId,
      telegram_id: String(body?.telegram_id ?? ''),
      init_data: initData,
      role: normalizeRole(body?.role),
      viloyat,
      tuman,
      school_inn: schoolFromDirectory?.inn ?? schoolInn ?? '',
      school_name: schoolName,
      category,
      subcategory: normalizedSubcategory,
      description,
      contact: asOptionalString(body?.contact) ?? '',
      priority: asOptionalString(body?.priority) ?? 'medium',
      status: 'new',
      created_at: new Date().toISOString(),
    }

    // Persist first, then:
    // - no photo: notify admins immediately
    // - has photo: upload route will notify admins with photo first + caption
    await createComplaint(payload)
    if (!hasPhoto) {
      await sendAdminComplaintNotification(payload)
    }

    // Optional n8n forwarding (non-blocking for local demo stability).
    if (isN8nForwardEnabled()) {
      axios.post(process.env.N8N_WEBHOOK_URL!, payload).catch((error) => {
        console.error('N8N forward failed:', error)
      })
    }

    return NextResponse.json({ ok: true, request_id: requestId })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
