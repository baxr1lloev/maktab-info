import { NextRequest, NextResponse } from 'next/server'
import { getComplaintByRequestId, updateComplaintStatus } from '@/lib/db'
import { patchSchoolApi } from '@/lib/school-api'
import axios from 'axios'
import { publishComplaintToClosedChannel } from '@/lib/closed-channel-notify'
import { notifyUserAboutComplaintStatus } from '@/lib/user-notify'

function isN8nForwardEnabled(): boolean {
  return (
    process.env.ENABLE_N8N_WEBHOOK === 'true' &&
    Boolean(process.env.N8N_WEBHOOK_URL?.trim())
  )
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { request_id, status, comment } = await req.json()
    const normalizedStatus = String(status).trim() as
      | 'new'
      | 'pending'
      | 'resolved'
      | 'rejected'
    const complaint = await getComplaintByRequestId(request_id)
    const wasResolved = complaint.status === 'resolved'
    const statusChanged = complaint.status !== normalizedStatus
    const shouldPatchSchoolApi =
      normalizedStatus === 'pending' || normalizedStatus === 'resolved'

    const schoolApiPromise = shouldPatchSchoolApi
      ? (async () => {
          if (!complaint.schoolInn) return

          const subcategory = complaint.subcategory
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)

          if (subcategory.length === 0) return
          await patchSchoolApi(complaint.schoolInn, subcategory)
        })().catch((error) => {
          console.error('School API patch failed:', error)
        })
      : Promise.resolve()

    const n8nStatusPromise = isN8nForwardEnabled()
      ? axios
          .post(`${process.env.N8N_WEBHOOK_URL}/status`, {
            request_id,
            status: normalizedStatus,
            comment,
          })
          .catch((error) => {
            console.error('N8N status forward failed:', error)
          })
      : Promise.resolve()

    const publishToClosedChannelPromise =
      normalizedStatus === 'resolved' && !wasResolved
        ? publishComplaintToClosedChannel(complaint).catch((error) => {
            console.error('Closed channel publish failed:', error)
          })
        : Promise.resolve()

    const notifyUserPromise =
      statusChanged &&
      (normalizedStatus === 'pending' ||
        normalizedStatus === 'resolved' ||
        normalizedStatus === 'rejected')
        ? notifyUserAboutComplaintStatus({
            telegramId: complaint.telegramId,
            requestId: request_id,
            status: normalizedStatus,
            comment,
          }).catch((error) => {
            console.error('User status notification failed:', error)
          })
        : Promise.resolve()

    await Promise.all([
      updateComplaintStatus(request_id, normalizedStatus, comment),
      schoolApiPromise,
      n8nStatusPromise,
      publishToClosedChannelPromise,
      notifyUserPromise,
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Status update error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
