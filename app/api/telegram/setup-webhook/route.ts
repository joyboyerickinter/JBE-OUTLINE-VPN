import { NextResponse } from "next/server";
import { telegramApi } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const setupSecret = process.env.TELEGRAM_WEBHOOK_SETUP_SECRET;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (!setupSecret || request.headers.get("authorization") !== `Bearer ${setupSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!webhookSecret || !appUrl || !appUrl.startsWith("https://")) {
    return NextResponse.json({ error: "Set APP_URL and Telegram webhook secrets first." }, { status: 503 });
  }
  try {
    const result = await telegramApi("setWebhook", {
      url: `${appUrl}/api/telegram/webhook`,
      secret_token: webhookSecret,
      allowed_updates: ["callback_query"],
      drop_pending_updates: false,
    });
    await telegramApi("setChatMenuButton", {
      menu_button: { type: "web_app", text: "Open VPN Shop", web_app: { url: appUrl } },
    });
    return NextResponse.json({ ok: true, result, miniAppMenuConfigured: true });
  } catch {
    return NextResponse.json({ error: "Telegram webhook registration failed. Check the bot token and APP_URL." }, { status: 502 });
  }
}
