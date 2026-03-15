# Maktab Infra — Полное описание проекта

## 1. Что это за проект

`Maktab Infra` — это Telegram Mini App + Telegram Bot для приема и обработки жалоб по инфраструктуре школ.

Пользователь открывает мини-приложение из Telegram, заполняет форму, при необходимости прикладывает фото, а дальше система:

- сохраняет заявку в PostgreSQL,
- отправляет уведомления администраторам,
- позволяет администратору менять статус заявки прямо в Telegram,
- уведомляет заявителя о статусе,
- при подтверждении публикует заявку в закрытый канал,
- при включенной интеграции пересылает события в n8n.

## 2. Технологический стек

- Frontend/UI: `Next.js 16 (App Router)`, `React 19`, `Tailwind CSS v4`
- Backend API: `Next.js Route Handlers` (`app/api/*`)
- Telegram Bot: `Telegraf`
- База данных: `PostgreSQL 16` + `Prisma`
- Интеграции: `n8n` (webhooks), внешний School API (`axios`)
- Локальная инфраструктура: `Docker Compose` (Postgres + n8n)

Примечание: зависимость `googleapis` установлена, но в текущем коде фактически не используется.

## 3. Структура проекта

Ключевые директории и файлы:

- `app/page.tsx` — клиентская форма Mini App (русский интерфейс)
- `app/layout.tsx` — подключение Telegram WebApp SDK
- `app/api/*` — backend endpoints
- `lib/bot.ts` — логика Telegram-бота (команды, callback-кнопки, workflow закрытия)
- `lib/db.ts` — слой работы с Prisma/БД
- `lib/school-directory.ts` + `lib/maktab.json` — локальный справочник школ
- `lib/admin-notify.ts` / `lib/user-notify.ts` / `lib/closed-channel-notify.ts` — уведомления
- `lib/verify.ts` — проверка Telegram `initData` (HMAC)
- `lib/compress-image.ts` — client-side сжатие фото перед загрузкой
- `prisma/schema.prisma` + `prisma/migrations/*` — схема и миграции БД
- `scripts/set-webhook.ts` — регистрация webhook Telegram-бота
- `docker-compose.yml` — локальные сервисы Postgres и n8n

## 4. Как устроен end-to-end поток

### 4.1 Старт пользователя

1. Пользователь пишет боту `/start`.
2. Бот отправляет кнопку открытия Mini App (`NEXT_PUBLIC_APP_URL`).
3. Mini App загружает Telegram WebApp SDK и получает `initData` + пользователя.

### 4.2 Заполнение формы

1. Форма получает регионы/школы через `GET /api/schools` (данные из `lib/maktab.json`).
2. Пользователь заполняет поля жалобы и отправляет форму.
3. Отправка идет в `POST /api/webhook`.

### 4.3 Создание заявки (`POST /api/webhook`)

Внутри route:

1. Проверка `initData` через `verifyTelegramData(...)`.
2. Нормализация данных школы (по `school_uid`/`inn` через справочник).
3. Создание `request_id` формата `REQ-XXXX`.
4. Сохранение заявки в PostgreSQL через Prisma.
5. Если фото нет: сразу уведомление админу.
6. Если включен n8n (`ENABLE_N8N_WEBHOOK=true`) — неблокирующая отправка в `N8N_WEBHOOK_URL`.

### 4.4 Загрузка фото до исправления (`POST /api/upload`)

1. На клиенте фото сжимается (`compressImage`).
2. Route снова проверяет `initData`.
3. Фото отправляется ботом в служебный чат/канал, берется `file_id`.
4. Временное сообщение удаляется (чтобы не засорять чат).
5. `before_file_id` сохраняется в БД.
6. Админам отправляется карточка заявки уже с фото.

### 4.5 Модерация в Telegram

Админ в боте получает inline-кнопки:

- `✅ Принять`
- `⏳ В работу`
- `❌ Отклонить`

Нажатие кнопки вызывает callback в `lib/bot.ts`, который отправляет `POST /api/status` с `x-webhook-secret`.

### 4.6 Обновление статуса (`POST /api/status`)

Route делает несколько действий параллельно:

1. Обновляет статус заявки в БД.
2. Для `pending/resolved` — пробует PATCH во внешний School API (по карте полей).
3. При включенном n8n — отправляет status event в `N8N_WEBHOOK_URL/status`.
4. При первом `resolved` — публикует заявку в закрытый канал.
5. Уведомляет пользователя в Telegram о новом статусе.

### 4.7 Закрытие с фото после исправления

1. Админ дает команду `/close REQ-XXXX`.
2. Бот переводит админа в режим ожидания фото.
3. Следующее фото админа сохраняется как `after_file_id`, статус становится `resolved`.
4. При включенном n8n отправляется событие `N8N_WEBHOOK_URL/resolved`.

### 4.8 Публикация before/after через n8n

Если n8n вызывает `POST /api/notify-resolved`, route берет `before_file_id` и `after_file_id` из БД и публикует "Было/Стало" в `REPORT_CHAT_ID`.

## 5. API-эндпоинты проекта

### Публичные для Mini App / Telegram

- `GET /api/schools`
  - Возвращает список регионов или школ по региону.
- `POST /api/webhook`
  - Прием основной формы жалобы.
  - Защита: Telegram `initData` HMAC.
- `POST /api/upload`
  - Загрузка фото к заявке.
  - Защита: Telegram `initData` HMAC.
- `POST /api/bot`
  - Telegram webhook endpoint для обновлений бота.

### Внутренние сервисные (n8n/бот)

Все защищены заголовком `x-webhook-secret`:

- `POST /api/status`
- `POST /api/notify-admin`
- `POST /api/notify-user`
- `POST /api/notify-resolved`

## 6. Логика Telegram-бота

Файл: `lib/bot.ts`.

Основные возможности:

- `/start` — приветствие + кнопка открытия Mini App.
- `/admin` — админ-панель с фильтрами.
- `/tickets [all|new|pending|resolved|rejected]` — список последних заявок.
- Inline-кнопки изменения статуса заявки.
- `/close REQ-XXXX` (и legacy-формат `/close_REQ-XXXX`) — закрытие с фото "после".

Роли админов определяются `ADMIN_USER_IDS`.

## 7. Модель данных (PostgreSQL + Prisma)

Таблица `Complaint` содержит:

- Идентификаторы: `id`, `requestId`, `telegramId`
- Данные школы: `viloyat`, `tuman`, `schoolInn`, `schoolName`
- Данные жалобы: `category`, `subcategory`, `description`, `contact`, `priority`
- Статусы: `status`, `adminComment`, `resolvedAt`, `daysToResolve`
- Фото: `beforeFileId`, `afterFileId`
- Служебные поля: `createdAt`, `updatedAt`

Индексы:

- по `status`
- по `createdAt`

## 8. Интеграция со справочником школ

Источник данных: `lib/maktab.json`.

Через `lib/school-directory.ts` реализовано:

- нормализация названий регионов,
- быстрый поиск школ по `inn` и `school_uid`,
- выдача отсортированных списков школ по региону.

## 9. Интеграция с внешним School API

Файл: `lib/school-api.ts`.

При статусах `pending` и `resolved`:

- берется `schoolInn`,
- из выбранных подкатегорий формируется payload по `FIELD_MAP`,
- выполняется `PATCH ${SCHOOL_API_URL}/{inn}` с `Bearer ${SCHOOL_API_TOKEN}`.

Если подкатегории не мапятся — запрос не отправляется.

## 10. Переменные окружения

### Обязательные для работы

- `BOT_TOKEN`
- `DATABASE_URL`
- `WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`

### Для бота/чатов

- `ADMIN_USER_IDS` — список Telegram user id админов через запятую
- `ADMIN_CHAT_ID` — fallback чат
- `MODERATION_CHAT_ID` — чат модерации (опционально)
- `REPORT_CHAT_ID` — канал/чат публикаций
- `CLOSED_CHANNEL_CHAT_ID` — закрытый канал публикаций (опционально)
- `PHOTO_STORAGE_CHAT_ID` — служебный чат для получения `file_id`

### Для n8n

- `ENABLE_N8N_WEBHOOK` (`true/false`)
- `N8N_WEBHOOK_URL` (базовый URL, например `http://localhost:5678/webhook/maktab`)

### Для School API

- `SCHOOL_API_URL`
- `SCHOOL_API_TOKEN`

### Для скрипта webhook регистрации

- `APP_URL` (или используется `NEXT_PUBLIC_APP_URL`)

## 11. Безопасность

1. `POST /api/webhook` и `POST /api/upload` проверяют подлинность Telegram пользователя через HMAC (`initData` + `BOT_TOKEN`).
2. Внутренние endpoints закрыты `x-webhook-secret`.
3. Админские действия в боте ограничены `ADMIN_USER_IDS`.
4. Фото сначала попадает в служебный storage-чат, чтобы работать через Telegram `file_id`.

## 12. Локальный запуск (кратко)

1. Поднять сервисы:
   - `docker compose up -d`
2. Применить миграции:
   - `npx prisma migrate deploy`
3. Запустить приложение:
   - `npm run dev`
4. Открыть n8n:
   - `http://localhost:5678`
5. Для Mini App в Telegram нужен HTTPS URL (например `cloudflared`) и webhook бота на:
   - `https://<your-domain>/api/bot`

## 13. Как работает с cloudflared

Если используется `cloudflared` (trycloudflare):

1. Поднимаете tunnel на локальный Next.js порт.
2. Прописываете tunnel URL в `NEXT_PUBLIC_APP_URL` (и желательно `APP_URL`).
3. Обновляете Telegram webhook на `https://.../api/bot`.

Важно: при каждом новом временном `trycloudflare` URL webhook нужно выставлять заново.

## 14. Что можно улучшить дальше

- Добавить явный `parent` label в админских уведомлениях/каналах (сейчас fallback выводит исходное значение роли).
- Снизить риск коллизии `request_id` (сейчас `REQ-${last4(timestamp)}`).
- Добавить автотесты (минимум API smoke tests + интеграционные тесты bot callbacks).
- Вынести n8n workflow в versioned JSON рядом с кодом.
