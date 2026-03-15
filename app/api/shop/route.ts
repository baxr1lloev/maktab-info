import { NextRequest, NextResponse } from 'next/server'
import {
  authenticateTelegramInitData,
  extractInitDataFromRequest,
} from '@/lib/telegram-webapp-auth'
import { listActiveShopItems } from '@/lib/shop'

export async function GET(req: NextRequest) {
  const initData = extractInitDataFromRequest(req)
  const auth = authenticateTelegramInitData(initData)

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  try {
    const items = await listActiveShopItems()
    return NextResponse.json({ ok: true, items })
  } catch (error) {
    console.error('Shop list error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
