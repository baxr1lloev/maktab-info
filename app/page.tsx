'use client'
import { useEffect, useMemo, useState } from 'react'
import { compressImage } from '@/lib/compress-image'

type TelegramUser = {
  id: number
  first_name?: string
  last_name?: string
}

type TelegramWebApp = {
  ready: () => void
  expand: () => void
  close: () => void
  showAlert: (text: string) => void
  initData?: string
  initDataUnsafe?: { user?: TelegramUser }
  backgroundColor?: string
  textColor?: string
}

type SchoolOption = {
  school_uid: string
  inn: string
  viloyat: string
  tuman: string
  school_name: string
}

type ViloyatResponse = {
  ok: boolean
  viloyatlar: string[]
}

type SchoolsResponse = {
  ok: boolean
  schools: SchoolOption[]
}

const CATEGORIES = [
  { id: 'remont',      label: '🔧 Ремонт',         icon: '🔧' },
  { id: 'elektr',      label: '⚡ Электричество',   icon: '⚡' },
  { id: 'joy',         label: '🏫 Нехватка мест',   icon: '🏫' },
  { id: 'shikoyat',    label: '📝 Жалоба/Предложение', icon: '📝' },
]

const SUBCATEGORIES: Record<string, string[]> = {
  remont:   ['Спортзал', 'Столовая', 'Актовый зал', 'Кровля', 'Отопление', 'Сантехника'],
  elektr:   ['Нет электричества', 'Нет интернета', 'Нет освещения'],
  joy:      ['Переполненность', 'Нет кабинетов', 'Нет мебели'],
  shikoyat: ['Учителя', 'Администрация', 'Учебные материалы', 'Другое'],
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [tg, setTg] = useState<TelegramWebApp | null>(null)
  const [user, setUser] = useState<TelegramUser | null>(null)
  const [viloyatlar, setViloyatlar] = useState<string[]>([])
  const [selectedViloyat, setSelectedViloyat] = useState('')
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [selectedSchoolUid, setSelectedSchoolUid] = useState('')
  const [schoolsLoading, setSchoolsLoading] = useState(false)
  const [directoryError, setDirectoryError] = useState('')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState<string[]>([])
  const [role, setRole] = useState<'student' | 'teacher'>('student')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [requestId, setRequestId] = useState('')

  const selectedSchool = useMemo(
    () => schools.find((school) => school.school_uid === selectedSchoolUid) ?? null,
    [schools, selectedSchoolUid]
  )

  useEffect(() => {
    setMounted(true)

    const webApp = (window as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
    if (webApp) {
      webApp.ready()
      webApp.expand()
      setTg(webApp)
      setUser(webApp.initDataUnsafe?.user ?? null)

      // Apply Telegram theme colors
      document.documentElement.style.setProperty('--tg-bg',   webApp.backgroundColor ?? '#ffffff')
      document.documentElement.style.setProperty('--tg-text', webApp.textColor ?? '#000000')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadViloyatlar() {
      try {
        const res = await fetch('/api/schools')
        const data = (await res.json()) as ViloyatResponse
        if (!res.ok || !data.ok) {
          throw new Error('Не удалось загрузить список регионов')
        }
        if (!cancelled) {
          setViloyatlar(data.viloyatlar ?? [])
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load regions:', error)
          setDirectoryError('Не удалось загрузить справочник школ')
        }
      }
    }

    loadViloyatlar()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadSchools() {
      if (!selectedViloyat) {
        setSchools([])
        setSelectedSchoolUid('')
        return
      }

      setSchoolsLoading(true)
      setSelectedSchoolUid('')

      try {
        const params = new URLSearchParams({ viloyat: selectedViloyat })
        const res = await fetch(`/api/schools?${params.toString()}`)
        const data = (await res.json()) as SchoolsResponse
        if (!res.ok || !data.ok) {
          throw new Error('Не удалось загрузить школы')
        }

        if (!cancelled) {
          setSchools(data.schools ?? [])
          setDirectoryError('')
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load schools:', error)
          setSchools([])
          setDirectoryError('Не удалось загрузить школы по выбранному региону')
        }
      } finally {
        if (!cancelled) {
          setSchoolsLoading(false)
        }
      }
    }

    loadSchools()

    return () => {
      cancelled = true
    }
  }, [selectedViloyat])

  if (!mounted) {
    return <main className="min-h-screen bg-gray-50" />
  }

  function toggleSubcategory(sub: string) {
    setSubcategory(prev =>
      prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

    const form = new FormData(e.currentTarget)
    const description = String(form.get('description') ?? '').trim()

    if (!selectedViloyat || !selectedSchool || !category || !description) {
      tg?.showAlert('⚠️ Заполните регион, школу, категорию и описание проблемы')
      return
    }

    setLoading(true)

    try {
      const payload = {
        telegram_id:  user?.id ?? 0,
        init_data:    tg?.initData ?? '',
        viloyat:      selectedSchool.viloyat || selectedViloyat,
        tuman:        selectedSchool.tuman,
        school_inn:   selectedSchool.inn,
        school_uid:   selectedSchool.school_uid,
        school_name:  selectedSchool.school_name,
        category,
        subcategory,
        description,
        role,
        contact:      form.get('contact') ?? '',
        has_photo:    Boolean(photoFile),
        priority:     category === 'remont' && subcategory.length > 0 ? 'medium' : 'low',
      }

      const res = await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!data.ok) {
        throw new Error(data.error ?? 'Не удалось отправить жалобу')
      }

      setRequestId(data.request_id)

      // Upload photo if provided
      if (photoFile && tg?.initData) {
        const compressed = await compressImage(photoFile)
        const photoForm = new FormData()
        photoForm.append('photo', compressed, 'photo.jpg')
        photoForm.append('init_data', tg.initData)
        photoForm.append('request_id', data.request_id)
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: photoForm })
        const uploadData = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok || !uploadData.ok) {
          throw new Error(uploadData.error ?? 'Не удалось загрузить фото')
        }
      }

      setSubmitted(true)
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error && err.message ? err.message : 'Unknown error'
      tg?.showAlert(`❌ Ошибка: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-white">
        <div className="text-6xl">✅</div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Заявка принята!</h2>
          <p className="text-gray-500 mb-1">Ваш номер заявки:</p>
          <p className="text-2xl font-mono font-bold text-blue-600">{requestId}</p>
        </div>
        <p className="text-sm text-gray-400 text-center">
          Министерство рассмотрит вашу жалобу и уведомит вас в Telegram.
        </p>
        <button
          onClick={() => tg?.close()}
          className="px-8 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition"
        >
          Закрыть
        </button>
      </div>
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-blue-600 text-white px-5 py-6">
        <h1 className="text-xl font-bold">🏫 Maktab Infra</h1>
        <p className="text-sm text-blue-100 mt-1">Подайте жалобу о проблеме в школе</p>
        {user && (
          <p className="text-xs text-blue-200 mt-1">
            👤 {user.first_name} {user.last_name ?? ''}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* Viloyat */}
        <div className="card">
          <label className="label">📍 Вилоят *</label>
          <select
            name="viloyat"
            required
            className="input"
            value={selectedViloyat}
            onChange={(e) => setSelectedViloyat(e.target.value)}
          >
            <option value="">Выберите вилоят</option>
            {viloyatlar.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          {directoryError && (
            <p className="mt-2 text-sm text-red-600">{directoryError}</p>
          )}
        </div>

        {/* School */}
        <div className="card space-y-3">
          <div>
            <label className="label">🏫 Школа из базы (`/lib/maktab.json`) *</label>
            <select
              name="school_inn"
              required
              className="input"
              disabled={!selectedViloyat || schoolsLoading}
              value={selectedSchoolUid}
              onChange={(e) => setSelectedSchoolUid(e.target.value)}
            >
              <option value="">
                {selectedViloyat
                  ? schoolsLoading
                    ? 'Загрузка школ...'
                    : 'Выберите школу'
                  : 'Сначала выберите вилоят'}
              </option>
              {schools.map((school) => (
                <option key={school.school_uid} value={school.school_uid}>
                  {school.school_name} ({school.tuman}) — {school.inn}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">🔢 ИНН / Код школы</label>
            <input
              name="school_inn_preview"
              className="input bg-gray-100"
              value={selectedSchool?.inn ?? ''}
              readOnly
              placeholder="Выберите школу выше"
            />
          </div>
          <div>
            <label className="label">🏫 Название школы</label>
            <input
              name="school_name_preview"
              className="input bg-gray-100"
              value={selectedSchool?.school_name ?? ''}
              readOnly
              placeholder="Заполнится автоматически"
            />
          </div>
          <div>
            <label className="label">🧭 Район / Туман</label>
            <input
              name="tuman_preview"
              className="input bg-gray-100"
              value={selectedSchool?.tuman ?? ''}
              readOnly
              placeholder="Заполнится автоматически"
            />
          </div>
        </div>

        {/* Role toggle */}
        <div className="card">
          <label className="label">👤 Вы являетесь *</label>
          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            {(['student', 'teacher'] as const).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 py-2.5 text-sm font-medium transition ${
                  role === r
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r === 'student' ? '🎒 Ученик' : '👩‍🏫 Учитель'}
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div className="card">
          <label className="label">📋 Категория жалобы *</label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setCategory(cat.id); setSubcategory([]) }}
                className={`p-3 rounded-xl text-sm font-medium border-2 transition text-left ${
                  category === cat.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <span className="block text-lg mb-0.5">{cat.icon}</span>
                {cat.label.replace(/^[^ ]+ /, '')}
              </button>
            ))}
          </div>
        </div>

        {/* Subcategory pills */}
        {category && SUBCATEGORIES[category] && (
          <div className="card">
            <label className="label">🔍 Уточните проблему</label>
            <div className="flex flex-wrap gap-2">
              {SUBCATEGORIES[category].map(sub => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => toggleSubcategory(sub)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${
                    subcategory.includes(sub)
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="card">
          <label className="label">📝 Описание проблемы *</label>
          <textarea
            name="description"
            required
            rows={4}
            className="input resize-none"
            placeholder="Опишите проблему подробно..."
          />
        </div>

        {/* Photo upload */}
        <div className="card">
          <label className="label">📷 Фото проблемы (необязательно)</label>
          <label className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 transition">
            {photoFile ? (
              <>
                <span className="text-2xl">✅</span>
                <span className="text-sm text-green-600 font-medium">{photoFile.name}</span>
                <span className="text-xs text-gray-400">Нажмите для замены</span>
              </>
            ) : (
              <>
                <span className="text-3xl">📸</span>
                <span className="text-sm text-gray-500">Нажмите для выбора фото</span>
                <span className="text-xs text-gray-400">Откроет камеру на телефоне</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {/* Contact */}
        <div className="card">
          <label className="label">📞 Контакт (необязательно)</label>
          <input
            name="contact"
            className="input"
            placeholder="Телефон или Telegram username"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !category || !selectedViloyat || !selectedSchool}
          className="w-full py-4 bg-blue-500 text-white font-bold rounded-2xl shadow-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-base"
        >
          {loading ? '⏳ Отправка...' : '📤 Отправить жалобу'}
        </button>
      </form>
    </main>
  )
}
