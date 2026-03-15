# Maktab Infra — Промпт: Система баллов и кредитов доверия

---

## Контекст проекта

Ты работаешь над проектом **Maktab Infra** — Telegram Mini App + Telegram Bot для приёма и обработки жалоб по инфраструктуре школ Узбекистана.

**Текущий стек:**
- Frontend: Next.js 16 (App Router), React 19, Tailwind CSS v4
- Backend: Next.js Route Handlers (`app/api/*`)
- Telegram Bot: Telegraf
- БД: PostgreSQL 16 + Prisma
- Интеграции: n8n (webhooks), внешний School API (axios)
- Инфраструктура: Docker Compose

**Текущая модель данных (таблица `Complaint`):**

```prisma
model Complaint {
  id            Int      @id @default(autoincrement())
  requestId     String   @unique
  telegramId    String
  viloyat       String
  tuman         String
  schoolInn     String
  schoolName    String
  category      String
  subcategory   String?
  description   String
  contact       String?
  priority      String   @default("normal")
  status        String   @default("new")
  adminComment  String?
  resolvedAt    DateTime?
  daysToResolve Int?
  beforeFileId  String?
  afterFileId   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([status])
  @@index([createdAt])
}
```

**Текущий flow заявки:**

1. Пользователь открывает Mini App через `/start` в боте
2. Заполняет форму → `POST /api/webhook` (проверка initData HMAC)
3. При наличии фото → `POST /api/upload` (фото → Telegram file_id)
4. Админ получает уведомление с inline-кнопками: ✅ Принять / ⏳ В работу / ❌ Отклонить
5. Нажатие кнопки → callback в `lib/bot.ts` → `POST /api/status`
6. При закрытии: `/close REQ-XXXX` → бот ждёт фото → `afterFileId` сохраняется → статус `resolved`
7. При `resolved` → публикация в закрытый канал + уведомление пользователю

---

## Задача: добавить систему баллов и кредитов доверия

Нужно реализовать геймифицированную систему мотивации пользователей. Вот полная логика:

---

## 1. Модель пользователя

Добавить новую таблицу `User` в Prisma:

```prisma
model User {
  id             Int        @id @default(autoincrement())
  telegramId     String     @unique
  username       String?
  firstName      String?
  balance        Int        @default(0)       // социальные баллы
  trustCredits   Int        @default(3)       // кредиты доверия (макс = 3, стартовые = 3)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  complaints     Complaint[]
  purchases      Purchase[]
}
```

Связать `Complaint` с `User`:

```prisma
// в модели Complaint добавить:
userId         Int?
user           User?     @relation(fields: [userId], references: [id])
```

---

## 2. Правила начисления/списания

| Событие | Баллы | Кредиты доверия |
|---|---|---|
| Админ нажал ✅ Принять (статус `accepted`) | +10 баллов | без изменений |
| Админ закрыл с фото `/close REQ-XXXX` (статус `resolved`) | +20 баллов | без изменений |
| Админ нажал ❌ Отклонить — причина **фейк** | 0 баллов | **-1 кредит** |
| Админ нажал ❌ Отклонить — причина **не по теме** | 0 баллов | без изменений |
| Кредиты доверия достигли 0 | пользователь блокируется | заявки не принимаются |

**Важные правила:**
- При `rejected` не всегда снимать кредит — только если причина фейк. Реализовать через отдельный callback: `reject_fake` vs `reject_other`
- Максимум кредитов доверия = 3 (не превышать при начислении)
- Приоритет заявки при сортировке в `/tickets` у админа: сначала по `trustCredits DESC`, потом по `createdAt ASC`

---

## 3. Лавка (Shop) — демо-режим

Добавить таблицы:

```prisma
model ShopItem {
  id          Int        @id @default(autoincrement())
  title       String
  description String?
  price       Int                     // цена в баллах
  type        String                  // "promo_code" | "discount" | "service_demo"
  value       String                  // сам промокод или описание скидки
  stock       Int        @default(-1) // -1 = безлимит
  isActive    Boolean    @default(true)
  createdAt   DateTime   @default(now())
  purchases   Purchase[]
}

model Purchase {
  id         Int       @id @default(autoincrement())
  userId     Int
  itemId     Int
  user       User      @relation(fields: [userId], references: [id])
  item       ShopItem  @relation(fields: [itemId], references: [id])
  createdAt  DateTime  @default(now())
}
```

**Демо-товары (сидировать в `prisma/seed.ts`):**

| Название | Цена | Тип |
|---|---|---|
| Промокод Uzum Market -15% | 150 баллов | `promo_code` |
| Скидка Humans Mobile 1 месяц | 200 баллов | `discount` |
| [ДЕМО] Оплата электроэнергии | 500 баллов | `service_demo` |
| [ДЕМО] Оплата газа | 500 баллов | `service_demo` |
| Промокод Yandex Еда -20% | 100 баллов | `promo_code` |

---

## 4. Новые API эндпоинты

### `GET /api/user/me`
- Защита: Telegram initData HMAC
- Возвращает: `{ balance, trustCredits, complaintsCount, resolvedCount }`

### `GET /api/shop`
- Защита: Telegram initData HMAC
- Возвращает: список активных `ShopItem[]`

### `POST /api/shop/buy`
- Защита: Telegram initData HMAC
- Body: `{ itemId: number }`
- Логика:
  1. Проверить баланс пользователя >= цена товара
  2. Проверить stock (если не -1, то stock > 0)
  3. Списать баллы: `balance -= item.price`
  4. Уменьшить stock если нужно
  5. Создать `Purchase`
  6. Вернуть `{ success: true, value: item.value, newBalance: number }`

---

## 5. Изменения в боте (`lib/bot.ts`)

### Двухшаговое отклонение

Вместо одной кнопки `❌ Отклонить` — двухшаговый процесс:

1. Первый клик на `❌ Отклонить` → показать уточняющие кнопки:
   - `🚫 Фейк (снять кредит)` → callback: `reject_fake_REQ-XXXX`
   - `📋 Не по теме (без штрафа)` → callback: `reject_other_REQ-XXXX`

### Команда `/mystat` для пользователей

```
📊 Ваша статистика:
💰 Баланс: 150 баллов
⭐ Кредит доверия: 3/3
📋 Всего заявок: 5
✅ Решено: 2
```

### Команда `/shop` в боте

Показывает список товаров лавки с кнопками `🛒 Купить за X баллов`

### При блокировке пользователя (trustCredits = 0)

- `POST /api/webhook` возвращает ошибку
- В Mini App показывать: `"Ваш аккаунт заблокирован из-за нарушений. Обратитесь к администратору."`

---

## 6. Изменения в Mini App

### Шапка (`app/page.tsx`)

Добавить отображение баланса и кредитов (получать через `GET /api/user/me` при загрузке):

```
💰 150 баллов  ⭐ 3/3
```

### Новая страница `/shop`

- Карточки товаров: название, описание, цена в баллах
- Кнопка "Купить" (задизейблить если `balance < item.price`)
- После покупки — модалка с промокодом/значением
- Товары типа `service_demo` — показывать с лейблом `🔧 ДЕМО`

### Новая страница `/profile`

- Баланс и кредиты доверия
- История заявок пользователя
- Кнопка перехода в лавку

---

## 7. Новый файл `lib/scoring.ts`

Создать отдельный модуль для всей логики баллов:

```typescript
// lib/scoring.ts

// +10 баллов при принятии заявки
export async function awardAccepted(telegramId: string): Promise<void>

// +20 баллов при закрытии с фото
export async function awardResolved(telegramId: string): Promise<void>

// -1 кредит доверия при фейке
export async function penalizeFake(telegramId: string): Promise<void>

export async function getUserScore(telegramId: string): Promise<{
  balance: number
  trustCredits: number
}>

// возвращает true если trustCredits <= 0
export async function isUserBlocked(telegramId: string): Promise<boolean>
```

---

## 8. Миграция БД

Создать новую Prisma migration:

1. Таблица `User`
2. Таблица `ShopItem`
3. Таблица `Purchase`
4. Поле `userId` в `Complaint`
5. Seed файл `prisma/seed.ts` с демо-товарами лавки

---

## 9. Порядок реализации (рекомендуемый)

| Шаг | Что делаем | Файлы |
|---|---|---|
| 1 | Schema + Migration + Seed | `prisma/schema.prisma`, `prisma/seed.ts` |
| 2 | Логика баллов | `lib/scoring.ts` |
| 3 | Обновить бота | `lib/bot.ts` |
| 4 | Обновить статус endpoint | `app/api/status/route.ts` |
| 5 | Новые API | `app/api/user/me`, `app/api/shop`, `app/api/shop/buy` |
| 6 | Mini App UI | `app/page.tsx`, `app/shop/page.tsx`, `app/profile/page.tsx` |

---

## 10. Что НЕ делать сейчас

- ❌ Не интегрировать реальные платёжные системы (свет, газ) — только демо-карточки
- ❌ Не делать реальную верификацию промокодов у партнёров — просто показывать значение из БД
- ❌ Не усложнять антифрод — базового лимита через кредиты доверия достаточно для MVP

---

**Начни с шага 1: обнови `prisma/schema.prisma` и создай файл `prisma/seed.ts`.**
