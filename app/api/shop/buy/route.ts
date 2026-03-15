import { NextRequest, NextResponse } from 'next/server'
import {
  authenticateTelegramInitData,
  extractInitDataFromRequest,
} from '@/lib/telegram-webapp-auth'
import { ShopError, buyShopItem } from '@/lib/shop'

export async function POST(req: NextRequest) {
  const initData = extractInitDataFromRequest(req)
  const auth = authenticateTelegramInitData(initData)

  if (!auth.ok || !auth.user) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const itemId = Number(body?.itemId)
    const purchase = await buyShopItem({ telegramId: auth.user.id, itemId })

    return NextResponse.json({
      success: true,
      value: purchase.value,
      title: purchase.title,
      newBalance: purchase.newBalance,
    })
  } catch (error) {
    if (error instanceof ShopError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('Shop buy error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
