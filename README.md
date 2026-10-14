# JBE Outline VPN

Dedicated Telegram Mini App for buying Outline VPN access keys.

## Stack
- Next.js App Router + TypeScript
- Supabase project: `JBE-OUTLINE-VPN`
- Vercel project: `jbe-outline-vpn`
- Telegram Mini App identity validation
- Outline Server Management API (server-side only)

## Implemented
- Package listing API
- Telegram `initData` signature and freshness validation for customer requests
- Customer-bound order creation and order history
- Private payment screenshot uploads
- Telegram admin payment review buttons
- Server-side Outline key creation after admin approval
- Daily expiry job for revoking expired keys

## Required configuration
Set these in Vercel Project Settings → Environment Variables (Production and Preview as appropriate):

- `NEXT_PUBLIC_SUPABASE_URL`: `https://txxfhxlhlxclzxpekngj.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase publishable/anon key (not used for privileged operations)
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase service role key
- `TELEGRAM_BOT_TOKEN`: the bot token used for the Mini App
- `TELEGRAM_ADMIN_CHAT_ID`: the admin Telegram chat ID (must be a chat the bot can message)
- `TELEGRAM_WEBHOOK_SECRET`: random secret token for Telegram webhook validation
- `TELEGRAM_WEBHOOK_SETUP_SECRET`: a separate random secret used once to register the webhook
- `CRON_SECRET`: random secret protecting the expiry endpoint
- `OUTLINE_SERVER_1_API_URL`, `OUTLINE_SERVER_2_API_URL`, `OUTLINE_SERVER_3_API_URL`: management API URLs copied from Outline Manager. These are highly sensitive.

After setting variables, redeploy. Then call `POST /api/telegram/setup-webhook` with `Authorization: Bearer <TELEGRAM_WEBHOOK_SETUP_SECRET>` once to register Telegram's webhook. The bot's Mini App URL must point to the Vercel production domain.

## Configure products and payments
The database is intentionally not seeded with made-up prices or payment account numbers. Add the 3 package rows to `public.outline_vpn_packages` and active KBZPay/AYAPay rows to `public.outline_vpn_payment_settings` using the Supabase dashboard. The three server slots are already registered; their management URLs must be configured in Vercel.

## Security
- Never expose the Supabase service role key, Telegram bot token, webhook secrets, or Outline management URLs in browser code.
- Payment screenshots are stored in a private bucket.
- Public API roles have no access to private order/key tables; server routes use the service role only after validating Telegram `initData`.
- Approval callbacks are restricted to the configured admin chat and claim the order before key creation.

## Local development
1. Use Node.js 20 or newer.
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill in values.
4. `npm run dev`

## Important
This is not production-ready until the Vercel environment variables, package/payment rows, Telegram bot webhook + Mini App URL, and Outline management URLs are configured and a full test purchase succeeds.
