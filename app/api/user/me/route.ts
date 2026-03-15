import { NextRequest, NextResponse } from 'next/server'
import {
  authenticateTelegramInitData,
  extractInitDataFromRequest,
} from '@/lib/telegram-webapp-auth'
import { getUserStats } from '@/lib/scoring'
import { listUserComplaintsByTelegramId } from '@/lib/db'

export async function GET(req: NextRequest) {
  const initData = extractInitDataFromRequest(req)
  const auth = authenticateTelegramInitData(initData)

  if (!auth.ok || !auth.user) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  try {
    const [stats, recentComplaints] = await Promise.all([
      getUserStats(auth.user.id),
      listUserComplaintsByTelegramId(auth.user.id, 20),
    ])

    return NextResponse.json({
      ok: true,
      balance: stats.balance,
      trustCredits: stats.trustCredits,
      complaintsCount: stats.complaintsCount,
      resolvedCount: stats.resolvedCount,
      blocked: stats.trustCredits <= 0,
      recentComplaints,
    })
  } catch (error) {
    console.error('User me error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
