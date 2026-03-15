'use client'

import { useEffect, useState } from 'react'

type TelegramWebApp = {
  ready: () => void
  expand: () => void
  showAlert: (text: string) => void
  initData?: string
}

type ShopItem = {
  id: number
  title: string
  description: string | null
  price: number
  type: string
  value: string
  stock: number
}

type ShopResponse = {
  ok: boolean
  items: ShopItem[]
}

type UserMeResponse = {
  ok: boolean
  balance: number
  trustCredits: number
  blocked?: boolean
}

type BuyResponse = {
  success: boolean
  value: string
  title: string
  newBalance: number
  error?: string
}

export default function ShopPage() {
  const [tg, setTg] = useState<TelegramWebApp | null>(null)
  const [items, setItems] = useState<ShopItem[]>([])
  const [balance, setBalance] = useState(0)
  const [trustCredits, setTrustCredits] = useState(3)
  const [loading, setLoading] = useState(true)
  const [buyingId, setBuyingId] = useState<number | null>(null)
  const [rewardModal, setRewardModal] = useState<{ title: string; value: string } | null>(null)

  useEffect(() => {
    const webApp = (window as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
    if (!webApp) return
    webApp.ready()
    webApp.expand()
    setTg(webApp)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadShop() {
      if (!tg?.initData) return
      setLoading(true)

      try {
        const headers = { 'x-telegram-init-data': tg.initData }
        const [meRes, shopRes] = await Promise.all([
          fetch('/api/user/me', { headers }),
          fetch('/api/shop', { headers }),
        ])

        const meData = (await meRes.json()) as UserMeResponse
        const shopData = (await shopRes.json()) as ShopResponse

        if (!cancelled && meRes.ok && meData.ok) {
          setBalance(meData.balance)
          setTrustCredits(meData.trustCredits)
          if (meData.blocked) {
            tg.showAlert(
              'Ваш аккаунт заблокирован из-за нарушений. Покупки доступны, но новые заявки недоступны.'
            )
          }
        }

        if (!cancelled && shopRes.ok && shopData.ok) {
          setItems(shopData.items ?? [])
        }
      } catch (error) {
        console.error('Failed to load shop:', error)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadShop()

    return () => {
      cancelled = true
    }
  }, [tg])

  async function handleBuy(itemId: number) {
    if (!tg?.initData) return
    setBuyingId(itemId)

    try {
      const res = await fetch('/api/shop/buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': tg.initData,
        },
        body: JSON.stringify({ itemId }),
      })

      const data = (await res.json()) as BuyResponse
      if (!res.ok || !data.success) {
        tg.showAlert(data.error ?? 'Не удалось совершить покупку')
        return
      }

      setBalance(data.newBalance)
      setRewardModal({ title: data.title, value: data.value })
    } catch (error) {
      console.error('Buy error:', error)
      tg.showAlert('Ошибка покупки')
    } finally {
      setBuyingId(null)
    }
  }

  return (
    <main className="mini-shell pb-10">
      <div className="form-wrap space-y-4">
        <section className="form-card space-y-3">
          <h1 className="section-title">Лавка</h1>
          <p className="section-copy">Обменивайте социальные баллы на демо-награды и промокоды.</p>
          <div className="flex flex-wrap gap-2">
            <span className="chip-btn">💰 {balance} баллов</span>
            <span className="chip-btn">⭐ {trustCredits}/3</span>
          </div>
          <div className="flex gap-2">
            <a href="/" className="chip-btn">Форма</a>
            <a href="/profile" className="chip-btn">Профиль</a>
          </div>
        </section>

        {loading && (
          <section className="form-card">
            <p className="section-copy">Загружаем товары...</p>
          </section>
        )}

        {!loading && items.length === 0 && (
          <section className="form-card">
            <p className="section-copy">Пока нет доступных товаров.</p>
          </section>
        )}

        {!loading &&
          items.map((item) => {
            const isDemo = item.type === 'service_demo'
            const outOfStock = item.stock === 0
            const canBuy = balance >= item.price && !outOfStock && buyingId !== item.id

            return (
              <section key={item.id} className="form-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="section-title">{item.title}</h2>
                  {isDemo && <span className="chip-btn">🔧 ДЕМО</span>}
                </div>
                {item.description && <p className="section-copy">{item.description}</p>}
                <div className="flex flex-wrap gap-2">
                  <span className="chip-btn">💰 {item.price} баллов</span>
                  <span className="chip-btn">
                    📦 {item.stock === -1 ? '∞' : item.stock}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!canBuy}
                  className="submit-btn"
                  onClick={() => handleBuy(item.id)}
                >
                  {buyingId === item.id
                    ? 'Покупаем...'
                    : outOfStock
                      ? 'Нет в наличии'
                      : balance < item.price
                        ? 'Недостаточно баллов'
                        : `Купить за ${item.price}`}
                </button>
              </section>
            )
          })}
      </div>

      {rewardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="form-card w-full max-w-md space-y-3">
            <h2 className="section-title">Покупка завершена</h2>
            <p className="section-copy">{rewardModal.title}</p>
            <div className="rounded-2xl border border-[#c9c9c2] bg-[#ecece8] p-3 font-mono text-sm">
              {rewardModal.value}
            </div>
            <button type="button" className="submit-btn" onClick={() => setRewardModal(null)}>
              Понятно
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
