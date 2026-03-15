'use client'

import { useEffect, useState } from 'react'

type TelegramWebApp = {
  ready: () => void
  expand: () => void
  initData?: string
}

type UserComplaint = {
  requestId: string
  category: string
  status: string
  createdAt: string
  resolvedAt: string | null
}

type UserMeResponse = {
  ok: boolean
  balance: number
  trustCredits: number
  complaintsCount: number
  resolvedCount: number
  blocked?: boolean
  recentComplaints?: UserComplaint[]
}

function formatStatus(status: string): string {
  if (status === 'new') return '🆕 Новая'
  if (status === 'pending') return '⏳ В работе'
  if (status === 'accepted') return '✅ Принята'
  if (status === 'resolved') return '🏁 Решена'
  if (status === 'rejected') return '❌ Отклонена'
  return status
}

export default function ProfilePage() {
  const [tg, setTg] = useState<TelegramWebApp | null>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<UserMeResponse | null>(null)

  useEffect(() => {
    const webApp = (window as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
    if (!webApp) return
    webApp.ready()
    webApp.expand()
    setTg(webApp)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      if (!tg?.initData) return
      setLoading(true)

      try {
        const res = await fetch('/api/user/me', {
          headers: { 'x-telegram-init-data': tg.initData },
        })
        const payload = (await res.json()) as UserMeResponse
        if (!cancelled && res.ok && payload.ok) {
          setData(payload)
        }
      } catch (error) {
        console.error('Failed to load profile:', error)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [tg])

  return (
    <main className="mini-shell pb-10">
      <div className="form-wrap space-y-4">
        <section className="form-card space-y-3">
          <h1 className="section-title">Профиль</h1>
          <p className="section-copy">Ваша статистика, баланс и история обращений.</p>
          <div className="flex gap-2">
            <a href="/" className="chip-btn">Форма</a>
            <a href="/shop" className="chip-btn">Лавка</a>
          </div>
        </section>

        {loading && (
          <section className="form-card">
            <p className="section-copy">Загружаем профиль...</p>
          </section>
        )}

        {!loading && data && (
          <>
            <section className="form-card space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="chip-btn">💰 {data.balance} баллов</span>
                <span className="chip-btn">⭐ {data.trustCredits}/3</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#d8d8d2] bg-[#ecece8] p-3 text-sm">
                  <p className="caption-muted">Всего заявок</p>
                  <p className="text-lg font-bold text-[#1f1f1d]">{data.complaintsCount}</p>
                </div>
                <div className="rounded-2xl border border-[#d8d8d2] bg-[#ecece8] p-3 text-sm">
                  <p className="caption-muted">Решено</p>
                  <p className="text-lg font-bold text-[#1f1f1d]">{data.resolvedCount}</p>
                </div>
              </div>
              {data.blocked && (
                <p className="error-copy">
                  Ваш аккаунт заблокирован из-за нарушений. Обратитесь к администратору.
                </p>
              )}
            </section>

            <section className="form-card space-y-3">
              <h2 className="section-title">История заявок</h2>
              {(data.recentComplaints ?? []).length === 0 && (
                <p className="section-copy">Пока нет отправленных заявок.</p>
              )}
              {(data.recentComplaints ?? []).map((complaint) => (
                <div
                  key={complaint.requestId}
                  className="rounded-2xl border border-[#d8d8d2] bg-[#ecece8] p-3"
                >
                  <p className="text-sm font-semibold text-[#1f1f1d]">{complaint.requestId}</p>
                  <p className="text-sm text-[#6f6f69]">{complaint.category}</p>
                  <p className="text-sm text-[#1f1f1d]">{formatStatus(complaint.status)}</p>
                  <p className="caption-muted">
                    {new Date(complaint.createdAt).toLocaleDateString('ru-RU')}
                  </p>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
