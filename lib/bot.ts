import { Telegraf, Markup } from 'telegraf'
import axios from 'axios'
import { isAdminUserId } from '@/lib/admin-auth'
import { ShopError, buyShopItem, listActiveShopItems } from '@/lib/shop'
import { getUserStats } from '@/lib/scoring'

// Singleton — one instance for the entire server
const bot = new Telegraf(process.env.BOT_TOKEN!)

type TicketFilter = 'all' | 'new' | 'pending' | 'accepted' | 'resolved' | 'rejected'

const ADMIN_PANEL_BUTTON = '🛠 Админ панель'
const USER_STATS_BUTTON = '📊 Моя статистика'
const SHOP_BUTTON = '🛒 Лавка'
const TICKET_FILTER_LABELS: Record<TicketFilter, string> = {
  all: 'Все последние',
  new: 'Новые',
  pending: 'В работе',
  accepted: 'Принятые',
  resolved: 'Решенные',
  rejected: 'Отклоненные',
}

function isN8nForwardEnabled(): boolean {
  return (
    process.env.ENABLE_N8N_WEBHOOK === 'true' &&
    Boolean(process.env.N8N_WEBHOOK_URL?.trim())
  )
}

function isAdmin(ctx: { from?: { id?: number } }): boolean {
  return isAdminUserId(ctx.from?.id)
}

function roleLabel(role: string): string {
  if (role === 'student') return 'Ученик'
  if (role === 'teacher') return 'Учитель'
  if (role === 'parent') return 'Родитель'
  return role
}

function parseRequestIdFromCloseCommand(text: string): string | null {
  const trimmed = text.trim()

  const legacyPattern = /^\/close_(REQ-[\w-]+)$/i
  const legacyMatch = trimmed.match(legacyPattern)
  if (legacyMatch?.[1]) return legacyMatch[1]

  const parts = trimmed.split(/\s+/)
  const requestId = parts[1]?.trim()
  return requestId || null
}

function normalizeTicketFilter(raw?: string): TicketFilter {
  const normalized = (raw ?? '').toLowerCase().trim()
  if (
    normalized === 'new' ||
    normalized === 'pending' ||
    normalized === 'accepted' ||
    normalized === 'resolved' ||
    normalized === 'rejected'
  ) {
    return normalized
  }

  return 'all'
}

function parseTicketFilterFromCommand(text: string): TicketFilter {
  const parts = text.trim().split(/\s+/)
  return normalizeTicketFilter(parts[1])
}

function extractMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  if ('text' in message && typeof message.text === 'string') {
    return message.text
  }
  return ''
}

function extractMessageCaption(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  if ('caption' in message && typeof message.caption === 'string') {
    return message.caption
  }
  return ''
}

function removeStatusTail(text: string): string {
  const marker = '\n\n→ Статус:'
  const markerIndex = text.indexOf(marker)
  if (markerIndex === -1) return text
  return text.slice(0, markerIndex).trimEnd()
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    new: '🆕 Новая',
    pending: '⏳ В работе',
    accepted: '✅ Принята',
    resolved: '✅ Решена',
    rejected: '❌ Отклонена',
  }

  return map[status] ?? status
}

function formatDate(value: Date): string {
  return value.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function adminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📋 Все', 'admin_list_all'),
      Markup.button.callback('🆕 Новые', 'admin_list_new'),
    ],
    [
      Markup.button.callback('⏳ В работе', 'admin_list_pending'),
      Markup.button.callback('✅ Принятые', 'admin_list_accepted'),
    ],
    [
      Markup.button.callback('🏁 Решенные', 'admin_list_resolved'),
      Markup.button.callback('❌ Отклоненные', 'admin_list_rejected'),
    ],
  ])
}

async function sendAdminMenu(ctx: { reply: (...args: any[]) => Promise<unknown> }) {
  await ctx.reply(
    [
      '🛠 Админ-панель',
      'Выберите фильтр заявок или используйте команду `/tickets new`.',
      'Команда закрытия с фото: `/close REQ-1234`',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      ...adminMenuKeyboard(),
    }
  )
}

async function sendTicketsToAdmin(
  ctx: { reply: (...args: any[]) => Promise<unknown> },
  filter: TicketFilter
) {
  const { listRecentComplaints } = await import('@/lib/db')
  const status = filter === 'all' ? undefined : filter
  const complaints = await listRecentComplaints({ status, limit: 8 })

  if (complaints.length === 0) {
    await ctx.reply(`📭 Заявок по фильтру «${TICKET_FILTER_LABELS[filter]}» пока нет.`)
    return
  }

  await ctx.reply(`📂 ${TICKET_FILTER_LABELS[filter]}: ${complaints.length} шт.`)

  for (const complaint of complaints) {
    const shortDescription =
      complaint.description.length > 220
        ? `${complaint.description.slice(0, 220)}...`
        : complaint.description

    const trustCredits = complaint.user?.trustCredits ?? 3

    const text = [
      `🎫 ${complaint.requestId} (${formatStatus(complaint.status)})`,
      `📅 ${formatDate(complaint.createdAt)}`,
      `👤 ${roleLabel(complaint.role)}`,
      `⭐ Доверие: ${trustCredits}/3`,
      `📍 ${complaint.viloyat}`,
      `🏫 ${complaint.schoolName}`,
      `📋 ${complaint.category} — ${complaint.subcategory || '—'}`,
      `📝 ${shortDescription}`,
    ].join('\n')

    await ctx.reply(
      text,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Принять', `approve_${complaint.requestId}`),
          Markup.button.callback('⏳ В работу', `pending_${complaint.requestId}`),
          Markup.button.callback('❌ Отклонить', `reject_${complaint.requestId}`),
        ],
      ])
    )
  }
}

async function sendUserStats(
  ctx: {
    from?: { id?: number }
    reply: (text: string, extra?: any) => Promise<unknown>
  }
) {
  const telegramId = String(ctx.from?.id ?? '')
  if (!telegramId) {
    await ctx.reply('Не удалось определить ваш Telegram ID.')
    return
  }

  const stats = await getUserStats(telegramId)

  await ctx.reply(
    [
      '📊 Ваша статистика:',
      `💰 Баланс: ${stats.balance} баллов`,
      `⭐ Кредит доверия: ${stats.trustCredits}/3`,
      `📋 Всего заявок: ${stats.complaintsCount}`,
      `✅ Решено: ${stats.resolvedCount}`,
    ].join('\n')
  )
}

async function sendShop(
  ctx: {
    reply: (text: string, extra?: any) => Promise<unknown>
  }
) {
  const items = await listActiveShopItems()
  if (items.length === 0) {
    await ctx.reply('🛒 Лавка временно пуста.')
    return
  }

  await ctx.reply('🛍 Лавка наград. Нажмите кнопку, чтобы купить за баллы.')

  for (const item of items) {
    const demoLabel = item.type === 'service_demo' ? '🔧 ДЕМО' : ''
    const stockText =
      item.stock === -1 ? '∞' : item.stock > 0 ? String(item.stock) : 'нет в наличии'

    await ctx.reply(
      [
        `🎁 ${item.title} ${demoLabel}`.trim(),
        item.description ? `📝 ${item.description}` : '',
        `💰 Цена: ${item.price} баллов`,
        `📦 Остаток: ${stockText}`,
      ]
        .filter(Boolean)
        .join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback(`🛒 Купить за ${item.price}`, `shop_buy_${item.id}`)],
      ])
    )
  }
}

async function callStatusApi(input: {
  requestId: string
  status: 'pending' | 'accepted' | 'rejected'
  comment?: string
  rejectionReason?: 'fake' | 'other'
}) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': process.env.WEBHOOK_SECRET!,
    },
    body: JSON.stringify({
      request_id: input.requestId,
      status: input.status,
      comment: input.comment,
      rejection_reason: input.rejectionReason,
    }),
  })

  if (!response.ok) {
    throw new Error(`Status API returned ${response.status}`)
  }
}

// State map for tracking users awaiting "after" photo
const awaitingAfterPhoto = new Map<number, string>() // telegram_id → request_id

type CloseCommandContext = {
  from: { id: number }
  reply: (text: string) => Promise<unknown>
}

async function askForAfterPhoto(ctx: CloseCommandContext, requestId: string | null) {
  if (!requestId) {
    await ctx.reply('⚠️ Укажите ID заявки: /close REQ-0041')
    return
  }

  awaitingAfterPhoto.set(ctx.from.id, requestId)
  await ctx.reply(`📸 Отлично! Пришлите фото «после исправления» для заявки ${requestId}`)
}

// ─── /start command — show Mini App button ───────────────────────────────────
bot.start(async (ctx) => {
  if (isAdmin(ctx)) {
    await ctx.reply(
      '👋 Вы вошли как администратор.\nМини-апп и админ-панель доступны в одном боте.',
      Markup.keyboard([
        [Markup.button.webApp('📱 Открыть форму жалоб', process.env.NEXT_PUBLIC_APP_URL!)],
        [ADMIN_PANEL_BUTTON],
      ]).resize()
    )
    await sendAdminMenu(ctx)
    return
  }

  await ctx.reply(
    '👋 Добро пожаловать в Maktab Infra!\nПодайте жалобу о проблеме в школе через форму ниже:',
    Markup.keyboard([
      [Markup.button.webApp('📱 Открыть форму жалоб', process.env.NEXT_PUBLIC_APP_URL!)],
      [USER_STATS_BUTTON, SHOP_BUTTON],
    ]).resize()
  )
})

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ У вас нет прав администратора.')
    return
  }

  await sendAdminMenu(ctx)
})

bot.command('tickets', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ У вас нет прав администратора.')
    return
  }

  const filter = parseTicketFilterFromCommand(extractMessageText(ctx.message))
  await sendTicketsToAdmin(ctx, filter)
})

bot.command('mystat', async (ctx) => {
  await sendUserStats(ctx)
})

bot.command('shop', async (ctx) => {
  await sendShop(ctx)
})

bot.hears(ADMIN_PANEL_BUTTON, async (ctx) => {
  if (!isAdmin(ctx)) return
  await sendAdminMenu(ctx)
})

bot.hears(USER_STATS_BUTTON, async (ctx) => {
  await sendUserStats(ctx)
})

bot.hears(SHOP_BUTTON, async (ctx) => {
  await sendShop(ctx)
})

bot.action(
  /^admin_list_(all|new|pending|accepted|resolved|rejected)$/,
  async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.answerCbQuery('⛔ Нет доступа')
      return
    }

    const filter = (ctx.match[1] ?? 'all') as TicketFilter
    await ctx.answerCbQuery(`Показываю: ${TICKET_FILTER_LABELS[filter]}`)
    await sendTicketsToAdmin(ctx, filter)
  }
)

bot.action(/^shop_buy_(\d+)$/, async (ctx) => {
  const itemId = Number(ctx.match[1])
  const telegramId = String(ctx.from?.id ?? '')
  if (!telegramId) {
    await ctx.answerCbQuery('Не удалось определить пользователя')
    return
  }

  try {
    const result = await buyShopItem({ telegramId, itemId })
    await ctx.answerCbQuery('Покупка успешна!')
    await ctx.reply(
      [
        `✅ Покупка успешно оформлена: ${result.title}`,
        `🎁 Ваш бонус: ${result.value}`,
        `💰 Новый баланс: ${result.newBalance} баллов`,
      ].join('\n')
    )
  } catch (error) {
    if (error instanceof ShopError) {
      await ctx.answerCbQuery(error.message)
      return
    }
    console.error('Shop buy error:', error)
    await ctx.answerCbQuery('Ошибка покупки')
  }
})

// ─── Admin status buttons ────────────────────────────────────────────────────
bot.action(/^(approve|pending)_(REQ-[\w-]+)$/i, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('⛔ Нет доступа')
    return
  }

  const [, action, requestId] = ctx.match
  const statusMap: Record<'approve' | 'pending', { label: string; status: 'accepted' | 'pending' }> = {
    approve: { label: 'Принята ✅ (+10 баллов)', status: 'accepted' },
    pending: { label: 'В работе ⏳', status: 'pending' },
  }
  const key = action as 'approve' | 'pending'
  const { label, status } = statusMap[key]

  try {
    await callStatusApi({ requestId, status })

    const callbackMessage =
      'message' in ctx.callbackQuery ? ctx.callbackQuery.message : undefined
    const originalText = extractMessageText(callbackMessage)
    const originalCaption = extractMessageCaption(callbackMessage)
    const originalBody = originalText || originalCaption
    const updatedBody = `${removeStatusTail(originalBody)}\n\n→ Статус: ${label}`

    if (originalBody) {
      const pendingKeyboard =
        key === 'pending'
          ? Markup.inlineKeyboard([
              [
                Markup.button.callback('✅ Принять', `approve_${requestId}`),
                Markup.button.callback('❌ Отклонить', `reject_${requestId}`),
              ],
            ])
          : undefined

      if (originalText) {
        await ctx.editMessageText(updatedBody, pendingKeyboard)
      } else {
        await ctx.editMessageCaption(updatedBody, pendingKeyboard)
      }
    }

    await ctx.answerCbQuery(label)
  } catch (err) {
    console.error('Error updating status from bot action:', err)
    await ctx.answerCbQuery('Ошибка обновления статуса')
  }
})

bot.action(/^reject_(REQ-[\w-]+)$/i, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('⛔ Нет доступа')
    return
  }

  const requestId = ctx.match[1]
  await ctx.answerCbQuery('Выберите причину отклонения')
  await ctx.reply(
    `❌ Укажите причину отклонения заявки ${requestId}:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🚫 Фейк (снять кредит)', `reject_fake_${requestId}`)],
      [Markup.button.callback('📋 Не по теме (без штрафа)', `reject_other_${requestId}`)],
    ])
  )
})

bot.action(/^reject_(fake|other)_(REQ-[\w-]+)$/i, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('⛔ Нет доступа')
    return
  }

  const [, reason, requestId] = ctx.match
  const rejectionReason = reason as 'fake' | 'other'
  const comment = rejectionReason === 'fake' ? 'Фейк' : 'Не по теме'
  const label =
    rejectionReason === 'fake'
      ? 'Отклонена ❌ (фейк, -1 кредит)'
      : 'Отклонена ❌ (не по теме)'

  try {
    await callStatusApi({
      requestId,
      status: 'rejected',
      comment,
      rejectionReason,
    })

    await ctx.answerCbQuery(label)
    await ctx.editMessageText(`❌ Заявка ${requestId}\nПричина: ${comment}`)
  } catch (err) {
    console.error('Error rejecting ticket with reason:', err)
    await ctx.answerCbQuery('Ошибка обновления статуса')
  }
})

// ─── /close_REQ-XXXX — request "after" photo ─────────────────────────────────
bot.command('close', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ У вас нет прав администратора.')
    return
  }

  const requestId = parseRequestIdFromCloseCommand(ctx.message.text)
  await askForAfterPhoto(ctx, requestId)
})

// Keep backward compatibility with `/close_REQ-XXXX` format from initial guide
bot.hears(/^\/close_(REQ-[\w-]+)$/i, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ У вас нет прав администратора.')
    return
  }

  const requestId = ctx.match[1] ?? null
  await askForAfterPhoto(ctx, requestId)
})

// ─── Receive "after" photo ───────────────────────────────────────────────────
bot.on('photo', async (ctx) => {
  const requestId = awaitingAfterPhoto.get(ctx.from.id)
  if (!requestId) return // user is not in close-ticket mode

  const fileId = ctx.message.photo.at(-1)!.file_id

  try {
    // Import db helpers dynamically to avoid circular deps
    const { getComplaintByRequestId, updateComplaintField, updateComplaintStatus } =
      await import('@/lib/db')
    const { awardResolved } = await import('@/lib/scoring')
    const complaint = await getComplaintByRequestId(requestId)
    const wasResolved = complaint.status === 'resolved'

    await updateComplaintField(requestId, 'after_file_id', fileId)
    await updateComplaintStatus(requestId, 'resolved')

    if (!wasResolved) {
      await awardResolved(complaint.telegramId)
    }

    awaitingAfterPhoto.delete(ctx.from.id)

    // Notify n8n (optional in local mode).
    if (isN8nForwardEnabled()) {
      await axios.post(`${process.env.N8N_WEBHOOK_URL}/resolved`, {
        request_id: requestId,
      })
    }

    await ctx.reply(`✅ Заявка ${requestId} закрыта! Начислено +20 баллов.`)
  } catch (err) {
    console.error('Error closing ticket with after photo:', err)
    await ctx.reply('❌ Ошибка при закрытии заявки. Попробуйте ещё раз.')
  }
})

export { bot }
