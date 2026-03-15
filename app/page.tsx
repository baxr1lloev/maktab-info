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

type UserMeResponse = {
  ok: boolean
  balance: number
  trustCredits: number
  blocked?: boolean
}

const ROLE_OPTIONS = [
  { id: 'student', label: 'Ученик' },
  { id: 'teacher', label: 'Учитель' },
  { id: 'parent', label: 'Родитель' },
] as const

type ReporterRole = (typeof ROLE_OPTIONS)[number]['id']

const CATEGORIES = [
  { id: 'remont', label: 'Ремонт' },
  { id: 'elektr', label: 'Электричество' },
  { id: 'joy', label: 'Нехватка мест' },
  { id: 'shikoyat', label: 'Жалоба / Предложение' },
]

type SubcategoryOption = {
  value: string
  label: string
}

const SUBCATEGORIES: Record<string, SubcategoryOption[]> = {
  remont: [
    { value: 'Спортзал', label: 'Спортзал' },
    { value: 'Столовая', label: 'Столовая' },
    { value: 'Актовый зал', label: 'Актовый зал' },
    { value: 'Кровля', label: 'Кровля' },
    { value: 'Отопление', label: 'Отопление' },
    { value: 'Сантехника', label: 'Сантехника' },
  ],
  elektr: [
    { value: 'Нет электричества', label: 'Нет электричества' },
    { value: 'Нет интернета', label: 'Нет интернета' },
    { value: 'Нет освещения', label: 'Нет освещения' },
  ],
  joy: [
    { value: 'Переполненность', label: 'Переполненность' },
    { value: 'Нет кабинетов', label: 'Нет кабинетов' },
    { value: 'Нет мебели', label: 'Нет мебели' },
  ],
  shikoyat: [
    { value: 'Учителя', label: 'Учителя' },
    { value: 'Администрация', label: 'Администрация' },
    { value: 'Учебные материалы', label: 'Учебные материалы' },
    { value: 'Другое', label: 'Другое' },
  ],
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
  const [role, setRole] = useState<ReporterRole>('student')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [score, setScore] = useState<{ balance: number; trustCredits: number } | null>(null)

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

  useEffect(() => {
    let cancelled = false

    async function loadUserScore() {
      if (!tg?.initData) return

      try {
        const res = await fetch('/api/user/me', {
          headers: {
            'x-telegram-init-data': tg.initData,
          },
        })
        const data = (await res.json()) as UserMeResponse
        if (!res.ok || !data.ok) return

        if (!cancelled) {
          setScore({
            balance: data.balance,
            trustCredits: data.trustCredits,
          })
        }

        if (data.blocked) {
          tg.showAlert(
            'Ваш аккаунт заблокирован из-за нарушений. Обратитесь к администратору.'
          )
        }
      } catch (error) {
        console.error('Failed to load user score:', error)
      }
    }

    loadUserScore()

    return () => {
      cancelled = true
    }
  }, [tg])

  if (!mounted) {
    return <main className="mini-shell" />
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

    if ((score?.trustCredits ?? 1) <= 0) {
      tg?.showAlert(
        'Ваш аккаунт заблокирован из-за нарушений. Обратитесь к администратору.'
      )
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
        role: role,
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
        err instanceof Error && err.message ? err.message : 'Неизвестная ошибка'
      tg?.showAlert(`❌ Ошибка: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <main className="mini-shell">
        <div className="form-wrap flex min-h-[calc(100vh-3rem)] items-center">
          <section className="form-card w-full p-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#3f9362] text-2xl text-white">
              ✓
            </div>
            <h2 className="section-title mb-2">Жалоба отправлена</h2>
            <p className="section-copy mb-2">Номер вашей заявки:</p>
            <p className="mb-6 font-mono text-xl font-bold text-[#1f5c3d]">{requestId}</p>
            <p className="caption-muted mb-6">
              Мы рассмотрим обращение и уведомим вас в Telegram.
            </p>
            <button
              type="button"
              onClick={() => tg?.close()}
              className="submit-btn"
            >
              Закрыть мини-приложение
            </button>
          </section>
        </div>
      </main>
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <main className="mini-shell pb-10">
      <div className="form-wrap">
        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="form-card space-y-3">
            <h1 className="section-title">Отправить жалобу</h1>
            <p className="section-copy">
              Опишите, что произошло. Мы передадим обращение в нужный отдел и сохраним ваши
              данные в безопасности.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip-btn">💰 {score?.balance ?? 0} баллов</span>
              <span className="chip-btn">⭐ {score?.trustCredits ?? 3}/3</span>
            </div>
            <div className="flex items-center gap-2">
              <a href="/profile" className="chip-btn">
                Профиль
              </a>
              <a href="/shop" className="chip-btn">
                Лавка
              </a>
            </div>
            <div>
              <label className="field-label">Я</label>
              <div className="segment">
                {ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setRole(option.id)}
                    className={`segment-btn ${role === option.id ? 'segment-btn-active' : ''}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="form-card space-y-4">
            <h2 className="section-title">Информация о школе</h2>
            <p className="section-copy">
              Укажите точные данные школы, чтобы мы направили обращение в нужное управление
              образования.
            </p>

            <div>
              <label className="field-label">Регион</label>
              <select
                name="viloyat"
                required
                className="field-control"
                value={selectedViloyat}
                onChange={(e) => setSelectedViloyat(e.target.value)}
              >
                <option value="">Выберите регион</option>
                {viloyatlar.map((viloyat) => (
                  <option key={viloyat} value={viloyat}>
                    {viloyat}
                  </option>
                ))}
              </select>
              {directoryError && <p className="error-copy">{directoryError}</p>}
            </div>

            <div>
              <label className="field-label">Школа</label>
              <select
                name="school"
                required
                className="field-control"
                disabled={!selectedViloyat || schoolsLoading}
                value={selectedSchoolUid}
                onChange={(e) => setSelectedSchoolUid(e.target.value)}
              >
                <option value="">
                  {selectedViloyat
                    ? schoolsLoading
                      ? 'Загружаем школы...'
                      : 'Выберите школу'
                    : 'Сначала выберите регион'}
                </option>
                {schools.map((school) => (
                  <option key={school.school_uid} value={school.school_uid}>
                    {school.school_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Код школы</label>
                <input
                  name="school_code"
                  className="field-control"
                  value={selectedSchool?.inn ?? ''}
                  readOnly
                  placeholder="например SCH-1024"
                />
              </div>
              <div>
                <label className="field-label">Район</label>
                <input
                  name="district"
                  className="field-control"
                  value={selectedSchool?.tuman ?? ''}
                  readOnly
                  placeholder="Укажите район"
                />
              </div>
            </div>
          </section>

          <section className="form-card space-y-4">
            <div>
              <label className="field-label">Категория проблемы</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setCategory(item.id)
                      setSubcategory([])
                    }}
                    className={`chip-btn ${category === item.id ? 'chip-btn-active' : ''}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {category && SUBCATEGORIES[category] && (
              <div>
                <label className="field-label">Уточнение проблемы</label>
                <div className="flex flex-wrap gap-2">
                  {SUBCATEGORIES[category].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleSubcategory(option.value)}
                      className={`chip-btn ${
                        subcategory.includes(option.value) ? 'chip-btn-soft-active' : ''
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="field-label">Опишите проблему</label>
              <textarea
                name="description"
                required
                rows={5}
                className="field-control textarea-control"
                placeholder="Подробно опишите, что произошло, где это случилось и другие важные детали."
              />
            </div>

            <div>
              <label className="field-label">Фото (необязательно)</label>
              <label className="file-dropzone">
                {photoFile ? (
                  <>
                    <span className="file-dropzone-title">{photoFile.name}</span>
                    <span className="file-dropzone-copy">Нажмите, чтобы заменить фото</span>
                  </>
                ) : (
                  <>
                    <span className="file-dropzone-title">Нажмите, чтобы загрузить фото</span>
                    <span className="file-dropzone-copy">JPG или PNG, до 10 МБ</span>
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
          </section>

          <section className="form-card space-y-4">
            <h2 className="section-title">Контакт (необязательно)</h2>
            <input
              name="contact"
              className="field-control"
              placeholder="Телефон или username в Telegram"
            />
            <p className="caption-muted">
              Контакт нужен только для уточнения деталей обращения.
            </p>

            <button
              type="submit"
              disabled={loading || !category || !selectedViloyat || !selectedSchool}
              className="submit-btn"
            >
              {loading ? 'Отправка...' : 'Отправить жалобу'}
            </button>
            <p className="caption-muted">
              Отправляя форму, вы подтверждаете достоверность информации.
            </p>
            {user && (
              <p className="caption-muted">
                Авторизован: {user.first_name} {user.last_name ?? ''}
              </p>
            )}
          </section>
        </form>
      </div>
    </main>
  )
}
