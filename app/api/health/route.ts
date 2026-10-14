import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requiredVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ADMIN_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_WEBHOOK_SETUP_SECRET",
  "CRON_SECRET",
  "APP_URL",
  "OUTLINE_SERVER_1_API_URL",
  "OUTLINE_SERVER_2_API_URL",
  "OUTLINE_SERVER_3_API_URL",
] as const;

export async function GET() {
  const missing = requiredVariables.filter((name) => !process.env[name]);
  const checks: Record<string, "ok" | "not_configured" | "error" | "not_checked"> = {
    environment: missing.length ? "not_configured" : "ok",
    supabase: process.env.SUPABASE_SERVICE_ROLE_KEY ? "not_checked" : "not_configured",
    telegram: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID ? "ok" : "not_configured",
    outlineServers: [1, 2, 3].every((slot) => Boolean(process.env[`OUTLINE_SERVER_${slot}_API_URL`])) ? "ok" : "not_configured",
  };

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { error } = await supabaseAdmin().from("outline_vpn_packages").select("id").limit(1);
      checks.supabase = error ? "error" : "ok";
    } catch {
      checks.supabase = "error";
    }
  }

  const ready = Object.values(checks).every((value) => value === "ok");
  return NextResponse.json({
    ok: ready,
    checks,
    missingEnvironmentVariables: missing,
    note: "This endpoint never returns secret values. Outline management URLs are not contacted by this configuration check.",
  }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
