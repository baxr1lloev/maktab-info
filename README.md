<div align="center">

# Maktab Infra

**Telegram Mini App and bot for reporting school infrastructure problems**

![Next.js](https://img.shields.io/badge/Next.js_16-000?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169e1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2d3748?style=for-the-badge&logo=prisma)
![Telegram](https://img.shields.io/badge/Telegraf-26a5e4?style=for-the-badge&logo=telegram&logoColor=white)

</div>

## What it does

Parents and students open the Mini App from Telegram, pick their region and school, describe the
problem (a broken window, no heating, a leaking roof) and attach a photo. Admins receive the
report in the bot, change its status with inline buttons, and close it with an "after" photo.
The reporter is notified at every step, and resolved reports are published as before/after posts.

## How it works

```text
Telegram user ──/start──▶ Bot ──button──▶ Mini App (Next.js)
                                             │  POST /api/webhook   (initData checked with HMAC)
                                             │  POST /api/upload    (photo compressed on the client)
                                             ▼
                                   PostgreSQL via Prisma
                                             │
               Admin in bot ◀── report card with photo + inline buttons
                    │  Accept / In progress / Reject      ──▶ POST /api/status
                    │  /close REQ-XXXX + "after" photo   ──▶ status = resolved
                    ▼
     Reporter notified · before/after posted to a channel · optional n8n webhooks
```

## Highlights

- **Secure Mini App requests** — every call from the Mini App is verified with Telegram `initData`
  HMAC; internal service routes require a shared secret header
- **Photo pipeline** — images are compressed in the browser, stored in Telegram, and only the
  `file_id` is kept in the database
- **Moderation entirely in Telegram** — status buttons, `/admin` filters, `/close` flow with an
  "after" photo
- **Rewards and anti-spam** — points for accepted (+10) and resolved (+20) reports, spendable in an
  in-app shop; "trust credits" are taken away for fake reports
- **Integrations** — status changes can be pushed to an external School API and to n8n workflows
- **School directory** — regions and schools served from a local dataset through `GET /api/schools`

## Tech stack

| Part | Stack |
|---|---|
| Mini App | Next.js 16 (App Router), React 19, Tailwind CSS 4, Telegram WebApp SDK |
| API | Next.js Route Handlers |
| Bot | Telegraf (webhook mode) |
| Data | PostgreSQL 16, Prisma ORM with migrations |
| Infra | Docker Compose (Postgres + n8n) |

## Run locally

```bash
docker compose up -d            # Postgres and n8n
npm install
npx prisma migrate dev
npm run dev                     # http://localhost:3000
```

Set the bot token, the Mini App URL and the webhook secret in `.env` (see
[PROJECT_DESCRIPTION.md](PROJECT_DESCRIPTION.md) for the full list), then register the bot webhook
with `scripts/set-webhook.ts`.

A detailed description of every route and the bot logic (in Russian) is in
[PROJECT_DESCRIPTION.md](PROJECT_DESCRIPTION.md).
