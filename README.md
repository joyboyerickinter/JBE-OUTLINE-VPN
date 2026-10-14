# JBE Outline VPN

Dedicated Telegram Mini App for buying Outline VPN access keys.

## Stack
- Next.js App Router + TypeScript
- Supabase project: `JBE-OUTLINE-VPN`
- Vercel project: `jbe-outline-vpn`
- Telegram Mini App identity validation
- Outline Server Management API (server-side only)

## Implemented in the repository
- Package listing API and checkout UI
- Telegram `initData` signature and freshness validation for customer requests
- Customer-bound order creation and order history
- Private payment screenshot uploads
- Telegram admin payment review buttons
- Server-side Outline key creation after admin approval
- Protected endpoint and daily cron route for revoking expired keys
- Non-secret readiness endpoint at `/api/health` to check required environment variables and Supabase connectivity
- Device-limit feature intentionally excluded from the current MVP

## Required Vercel configuration
Set these in Project Settings → Environment Variables. Keep all server secrets unprefixed by `NEXT_PUBLIC_`.

- `NEXT_PUBLIC_SUPABASE_URL`: `https://txxfhxlhlxclzxpekngj.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase publishable/anon key (the app uses server-side access for privileged operations)
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase service role key
- `TELEGRAM_BOT_TOKEN`: the bot token used for the Mini App
- `TELEGRAM_ADMIN_CHAT_ID`: the admin's private Telegram chat ID (the bot must be able to message it)
- `TELEGRAM_WEBHOOK_SECRET`: random secret token for Telegram webhook validation
- `TELEGRAM_WEBHOOK_SETUP_SECRET`: a separate random secret used once to register the webhook
- `CRON_SECRET`: random secret protecting the expiry endpoint
- `APP_URL`: the HTTPS production URL for this Vercel project
- `OUTLINE_SERVER_1_API_URL`, `OUTLINE_SERVER_2_API_URL`, `OUTLINE_SERVER_3_API_URL`: management API URLs copied from Outline Manager. These are highly sensitive.

After setting variables and redeploying, register the bot webhook once by making a POST request to `/api/telegram/setup-webhook` with header `Authorization: Bearer <TELEGRAM_WEBHOOK_SETUP_SECRET>`. Configure the bot's Mini App URL to the production URL. The expiry endpoint is `/api/cron/expire-keys`; call it daily with header `Authorization: Bearer <CRON_SECRET>`.

## Configure packages and payment accounts
The database intentionally is not seeded with made-up prices or payment account numbers. Add the 3 package rows to `public.outline_vpn_packages` and active KBZPay/AYAPay rows to `public.outline_vpn_payment_settings` using the Supabase dashboard. The three server slots are already registered; their management URLs must be configured in Vercel.

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

## Readiness and launch checklist
1. Configure the Vercel environment variables listed above. Never paste secret values into chat or commit them.
2. Deploy, then open `https://<your-production-domain>/api/health`. It reports missing variable names and whether Supabase can read the packages table; it never returns secret values. A 503 response means setup is incomplete.
3. Add package prices and KBZPay/AYA Pay account details through the Telegram admin Mini App at `/admin` after the bot token and admin ID are configured.
4. Register the webhook by sending a POST request to `/api/telegram/setup-webhook` with `Authorization: Bearer <TELEGRAM_WEBHOOK_SETUP_SECRET>`.
5. Verify the Mini App URL with BotFather and open the Mini App from the dedicated Telegram bot.
6. Test package selection, both payment methods, screenshot upload, admin approval/rejection, key delivery, order history, and expiry/revocation on a test order before launch.
7. Confirm the Vercel cron schedule is active. The cron endpoint is `/api/cron/expire-keys` and requires `Authorization: Bearer <CRON_SECRET>`.

Device registration limits are deliberately not part of this MVP. The standard Outline Server API cannot reliably identify distinct physical devices sharing an access key.
