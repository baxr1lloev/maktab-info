# Maktab Infra — Next.js Project Scaffold

A **Telegram Mini App** for school complaint management in Uzbekistan.
Users (students/teachers) submit complaints about school infrastructure through a Telegram Mini App form. The system routes complaints to a ministry admin bot, stores data in Google Sheets, and optionally updates a school REST API.

## User Review Required

> [!IMPORTANT]
> The project will be scaffolded in a new `maktab-infra/` subdirectory inside `/Users/baxrilloev/Desktop/xakaton/`.
> All secret credentials (BOT_TOKEN, Google credentials, etc.) will be placed in `.env.local.example` with placeholder values — **you must fill them in before running**.

> [!WARNING]
> The guide specifies **n8n** for workflow automation — this requires Docker + a VPS for production. The scaffold will include a `docker-compose.yml` for local n8n setup but n8n configuration itself is manual (can't be done from code).

---

## Proposed Changes

### Project Initialization

#### [NEW] `maktab-infra/` directory (Next.js App)
- Run `npx create-next-app@latest maktab-infra --typescript --tailwind --app --no-src-dir`
- Install: `telegraf axios @google-cloud/local-auth googleapis`

---

### Configuration Files

#### [NEW] `.env.local.example`
Placeholder file with all required environment variables:
- `BOT_TOKEN`, `ADMIN_CHAT_ID`, `PHOTO_STORAGE_CHAT_ID`
- `N8N_WEBHOOK_URL`, `WEBHOOK_SECRET`
- `SCHOOL_API_URL`, `SCHOOL_API_TOKEN`
- `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
- `NEXT_PUBLIC_APP_URL`

#### [NEW] `docker-compose.yml`
n8n self-hosted setup for local development.

#### [NEW] `scripts/set-webhook.ts`
Helper script to register the Telegram bot webhook after deployment.

---

### Page Components

#### [NEW] `app/layout.tsx`
Root layout that injects the Telegram WebApp SDK `<script>` tag.

#### [NEW] `app/globals.css`
Tailwind base styles.

#### [NEW] `app/page.tsx`
Full complaint form with all fields:
- `viloyat` (select), `school_inn` (text), `school_name` (text)
- `category` (radio grid: Ремонт / Электричество / Места / Жалоба)
- `subcategory` (pills, multi-select)
- `description` (textarea), `role` (toggle: Ученик/Учитель)
- `contact` (optional text), `photo` (file input with camera capture)
- Client-side photo compression before upload
- Telegram WebApp SDK integration (`initData`, user info, `showAlert`, `close`)

---

### API Routes

#### [NEW] `app/api/webhook/route.ts`
Receives POST from Mini App form:
- Verifies `initData` via HMAC on the server
- Generates `request_id` (REQ-XXXX)
- Parallel: appends to Google Sheets + forwards to n8n webhook

#### [NEW] `app/api/notify-admin/route.ts`
Called by n8n → sends formatted message to admin Telegram chat with inline approve/pending/reject buttons. Protected by `x-webhook-secret`.

#### [NEW] `app/api/notify-user/route.ts`
Called by n8n → sends status update message to the user's Telegram. Protected by `x-webhook-secret`.

#### [NEW] `app/api/status/route.ts`
Called by n8n or bot button callbacks → updates Google Sheets status + notifies n8n. Protected by `x-webhook-secret`.

#### [NEW] `app/api/upload/route.ts`
Receives multipart form with compressed photo:
- Verifies `initData`
- Uploads photo via bot to storage chat → gets `file_id`
- Saves `before_file_id` to Sheets column P

#### [NEW] `app/api/notify-resolved/route.ts`
Called by n8n after ticket resolution → sends before/after photos to admin chat.

#### [NEW] `app/api/bot/route.ts`
Telegram bot webhook endpoint — passes updates to Telegraf.

---

### Library Modules

#### [NEW] `lib/bot.ts`
- Telegraf singleton initialization
- `/start` command handler (with Mini App keyboard button)
- Admin inline button handler (`approve_*`, `pending_*`, `reject_*`)
- `/close_REQ-XXXX` command — requests "after" photo
- Photo handler — saves `after_file_id`, closes ticket

#### [NEW] `lib/verify.ts`
HMAC-SHA256 verification of Telegram `initData` using `BOT_TOKEN`.

#### [NEW] `lib/db.ts`
Prisma/PostgreSQL helpers:
- `createComplaint(data)` — create a complaint row in PostgreSQL
- `updateComplaintStatus(requestId, status)` — update status/resolution fields
- `updateComplaintField(requestId, field, value)` — update single field (before/after file_id)
- `getComplaintByRequestId(requestId)` — fetch complaint by `request_id`

#### [NEW] `lib/school-api.ts`
- `FIELD_MAP` — maps subcategory names to school API field values
- `patchSchoolApi(inn, subcategory[])` — PATCH the school REST API

#### [NEW] `lib/compress-image.ts`
Browser-side canvas-based image compression (target: ~300–500KB from 5MB originals).

---

## Verification Plan

### Automated Tests
No existing test suite in the project. After scaffolding:

```bash
cd /Users/baxrilloev/Desktop/xakaton/maktab-infra
npm run build
```
A successful TypeScript build with no errors confirms all types, imports, and module structure are correct.

### Manual Verification
1. **Dev server starts**: `npm run dev` → open [http://localhost:3000](http://localhost:3000) → complaint form renders
2. **API routes exist**: `curl -X POST http://localhost:3000/api/webhook` → should return 401 (unauthorized, not 404)
3. **All lib modules compile**: covered by `npm run build` above

> [!NOTE]
> Full end-to-end testing (Telegram bot, Google Sheets, n8n) requires real credentials which the user must supply in `.env.local`.
