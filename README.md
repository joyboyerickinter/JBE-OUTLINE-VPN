# JBE Outline VPN

A dedicated Telegram Mini App for purchasing Outline VPN access keys.

## Stack
- Next.js App Router
- TypeScript
- Supabase (existing Supabase project; Outline VPN tables use the `outline_vpn_` prefix)
- Vercel
- Outline Server Management API (server-side only)

## Local development
1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the values.
4. Run `npm run dev`.

## Security rules
- Never expose Telegram bot tokens, Supabase service-role keys, or Outline API URLs/keys to the browser.
- Validate Telegram Mini App `initData` on the server before trusting the Telegram user identity.
- Keep payment screenshots private and restrict admin review/approval to authorized admins.
- Issue Outline access keys only from server-side code after a verified admin approval.
- Make approval idempotent so retries cannot issue duplicate keys.

## Current stage
Initial app scaffold only. Payment verification, Telegram validation, admin approval, Supabase queries, and Outline key issuance must be implemented and tested before production use.
