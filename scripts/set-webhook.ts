/**
 * Register the Telegram bot webhook after deploying to Vercel.
 *
 * Usage:
 *   BOT_TOKEN=<token> APP_URL=https://your-app.vercel.app npx ts-node scripts/set-webhook.ts
 *
 * Or simply run the curl command printed below.
 */

const BOT_TOKEN = process.env.BOT_TOKEN
const APP_URL   = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN env var is required')
  process.exit(1)
}

if (!APP_URL) {
  console.error('❌ APP_URL or NEXT_PUBLIC_APP_URL env var is required')
  process.exit(1)
}

const webhookUrl = `${APP_URL}/api/bot`
const isHttpsAppUrl = APP_URL.startsWith('https://')

async function callTelegram(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${path}`, init)
  const data = await res.json()

  if (!data.ok) {
    throw new Error(data.description ?? `Telegram API error: ${path}`)
  }

  return data
}

async function main() {
  console.log(`📡 Registering webhook: ${webhookUrl}`)

  await callTelegram(`setWebhook?url=${encodeURIComponent(webhookUrl)}`)
  console.log('✅ Webhook registered successfully!')
  console.log(`   URL: ${webhookUrl}`)

  await callTelegram('setMyCommands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start', description: 'Открыть мини-приложение' },
        { command: 'close', description: 'Закрыть заявку: /close REQ-XXXX' },
      ],
    }),
  })
  console.log('✅ Commands updated: /start, /close')

  if (isHttpsAppUrl) {
    await callTelegram('setChatMenuButton', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: 'web_app',
          text: 'Maktab Infra',
          web_app: { url: APP_URL },
        },
      }),
    })
    console.log('✅ Chat menu button set to Mini App')
  } else {
    console.log('⚠️ Chat menu button skipped: APP_URL must be HTTPS')
  }

  // Verify
  const info = await callTelegram('getWebhookInfo')
  console.log('\n📋 Webhook info:', JSON.stringify(info.result, null, 2))
}

main().catch(console.error)
