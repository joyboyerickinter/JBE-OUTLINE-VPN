import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramMiniAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export function validateTelegramInitData(initData: string): TelegramMiniAppUser {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("Telegram bot is not configured.");
  if (!initData || initData.length > 10_000) throw new Error("Open this app from Telegram.");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const userValue = params.get("user");
  if (!receivedHash || !/^\d+$/.test(String(authDate)) || !userValue) {
    throw new Error("Invalid Telegram session.");
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > 60 * 60 * 24) {
    throw new Error("Telegram session expired. Reopen the Mini App.");
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
  let received: Buffer;
  try { received = Buffer.from(receivedHash, "hex"); } catch { throw new Error("Invalid Telegram signature."); }
  if (received.length !== expectedHash.length || !timingSafeEqual(received, expectedHash)) {
    throw new Error("Telegram signature verification failed.");
  }

  let user: TelegramMiniAppUser;
  try { user = JSON.parse(userValue) as TelegramMiniAppUser; } catch { throw new Error("Invalid Telegram user."); }
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new Error("Invalid Telegram user.");
  return user;
}

export function readInitData(request: Request) {
  return request.headers.get("x-telegram-init-data") ?? "";
}

export async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram bot is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(`Telegram API request failed: ${method}`);
  }
  return result.result;
}
