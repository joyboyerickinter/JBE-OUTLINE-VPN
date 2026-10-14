import { readInitData, validateTelegramInitData } from "@/lib/telegram";

export function requireTelegramAdmin(request: Request) {
  const user = validateTelegramInitData(readInitData(request));
  const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminId || String(user.id) !== adminId) {
    throw new Error("ADMIN_FORBIDDEN");
  }
  return user;
}
