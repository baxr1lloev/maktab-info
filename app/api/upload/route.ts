import { NextRequest, NextResponse } from 'next/server'
import { verifyTelegramData } from '@/lib/verify'
import { getComplaintByRequestId, updateComplaintField } from '@/lib/db'
import { bot } from '@/lib/bot'
import { sendAdminComplaintNotification } from '@/lib/admin-notify'
import {
  getClosedChannelChatId,
  getPhotoStorageChatId,
  getReportChatId,
  sameChatId,
} from '@/lib/telegram-chat'
import { getAdminUserIds } from '@/lib/admin-auth'

function resolveSafeStorageTarget(): string {
  const configuredStorageChatId = getPhotoStorageChatId()
  const reportChatId = getReportChatId()
  const closedChannelChatId = getClosedChannelChatId()
  const pointsToPublicFlowChat =
    sameChatId(configuredStorageChatId, reportChatId) ||
    sameChatId(configuredStorageChatId, closedChannelChatId)

  if (!pointsToPublicFlowChat) {
    return configuredStorageChatId
  }

  const firstAdminUserId = getAdminUserIds()[0]
  if (firstAdminUserId) {
    console.warn(
      '[upload] PHOTO_STORAGE_CHAT_ID points to report/closed channel; using first admin as safe storage target.'
    )
    return String(firstAdminUserId)
  }

  console.warn(
    '[upload] PHOTO_STORAGE_CHAT_ID points to report/closed channel and no ADMIN_USER_IDS configured. Photo may appear in channel before moderation.'
  )

  return configuredStorageChatId
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const initData  = formData.get('init_data') as string
    const requestId = formData.get('request_id') as string
    const file      = formData.get('photo') as File

    if (!initData || !requestId || !file) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify the user is a legitimate Telegram user
    const isValid = verifyTelegramData(initData, process.env.BOT_TOKEN!)
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Upload photo via bot → get stable Telegram file_id
    const buffer = Buffer.from(await file.arrayBuffer())
    const complaint = await getComplaintByRequestId(requestId)
    const caption = [
      `📸 Фото к заявке ${requestId}`,
      `🏫 ${complaint.schoolName}`,
      `📍 ${complaint.viloyat}`,
      `📋 ${complaint.category} — ${complaint.subcategory || '—'}`,
    ].join('\n')
    const storageTarget = resolveSafeStorageTarget()

    const message = await bot.telegram.sendPhoto(
      storageTarget,
      { source: buffer },
      { caption }
    )

    const fileId = message.photo.at(-1)!.file_id // Largest resolution

    // Keep storage chat clean: file_id remains valid even after deleting the temp message.
    await bot.telegram.deleteMessage(storageTarget, message.message_id).catch((error) => {
      console.error(`Failed to delete temporary storage message in ${storageTarget}:`, error)
    })

    // Save before photo file_id in DB
    await updateComplaintField(requestId, 'before_file_id', fileId)

    // Notify admins with photo first (caption includes description + moderation buttons).
    await sendAdminComplaintNotification({
      request_id: requestId,
      school_name: complaint.schoolName,
      category: complaint.category,
      subcategory: complaint.subcategory,
      description: complaint.description,
      role: complaint.role,
      viloyat: complaint.viloyat,
      priority: complaint.priority,
      before_file_id: fileId,
    })

    return NextResponse.json({ ok: true, file_id: fileId })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
