import { NextResponse } from "next/server";
import { createOutlineKey } from "@/lib/outline";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { telegramApi } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Callback = {
  id: string;
  data?: string;
  message?: { chat?: { id?: number }; message_id?: number };
  from?: { id?: number };
};

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await request.json() as { callback_query?: Callback };
  const callback = update.callback_query;
  if (!callback?.data) return NextResponse.json({ ok: true });

  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChatId || String(callback.message?.chat?.id ?? "") !== adminChatId || String(callback.from?.id ?? "") !== adminChatId) {
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Not authorized.", show_alert: true });
    return NextResponse.json({ ok: true });
  }

  const match = /^ov:(approve|reject):([0-9a-f-]{36})$/i.exec(callback.data);
  if (!match) {
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Invalid action.", show_alert: true });
    return NextResponse.json({ ok: true });
  }

  const action = match[1];
  const orderId = match[2];
  const db = supabaseAdmin();
  const { data: order, error: orderError } = await db.from("outline_vpn_orders")
    .select("id,telegram_user_id,telegram_first_name,package_name_snapshot,duration_days_snapshot,price_mmk,status")
    .eq("id", orderId).maybeSingle();
  if (orderError || !order) {
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Order not found.", show_alert: true });
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    if (order.status !== "payment_submitted") {
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "This order has already been reviewed.", show_alert: true });
      return NextResponse.json({ ok: true });
    }
    const { error } = await db.from("outline_vpn_orders").update({
      status: "rejected", reviewed_by: String(callback.from?.id ?? ""), reviewed_at: new Date().toISOString(),
      review_note: "Payment proof rejected", updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("status", "payment_submitted");
    if (error) throw error;
    await telegramApi("sendMessage", { chat_id: order.telegram_user_id, text: `Your payment proof for order ${orderId} was not approved. Please contact support before placing another order.` });
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Order rejected." });
    await telegramApi("editMessageReplyMarkup", { chat_id: adminChatId, message_id: callback.message?.message_id, reply_markup: { inline_keyboard: [] } });
    return NextResponse.json({ ok: true });
  }

  if (order.status !== "payment_submitted") {
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "This order has already been reviewed.", show_alert: true });
    return NextResponse.json({ ok: true });
  }

  // Claim the order before contacting Outline, so duplicate Telegram callbacks cannot create duplicate keys.
  const { data: claimed, error: claimError } = await db.from("outline_vpn_orders").update({
    status: "approved", reviewed_by: String(callback.from?.id ?? ""), reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("status", "payment_submitted").select("id").maybeSingle();
  if (claimError || !claimed) {
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Order is already being reviewed.", show_alert: true });
    return NextResponse.json({ ok: true });
  }

  try {
    const { data: servers, error: serversError } = await db.from("outline_vpn_servers")
      .select("id,env_slot").eq("active", true).order("sort_order", { ascending: true });
    if (serversError) throw serversError;
    const available = (servers ?? []).find((server) => Boolean(process.env[`OUTLINE_SERVER_${server.env_slot}_API_URL`]));
    if (!available) throw new Error("No active Outline server is configured.");

    const key = await createOutlineKey(available.env_slot, `JBE-${order.telegram_user_id}-${orderId.slice(0, 8)}`);
    const expiresAt = new Date(Date.now() + Number(order.duration_days_snapshot) * 86_400_000).toISOString();
    const { error: keyError } = await db.from("outline_vpn_keys").insert({
      order_id: orderId, server_id: available.id, outline_key_id: key.id, access_url: key.accessUrl,
      status: "active", expires_at: expiresAt,
    });
    if (keyError) throw keyError;

    const { error: finishError } = await db.from("outline_vpn_orders").update({
      status: "fulfilled", updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("status", "approved");
    if (finishError) throw finishError;

    await telegramApi("sendMessage", {
      chat_id: order.telegram_user_id,
      text: [
        "✅ Your JBE Outline VPN key is ready!",
        `Package: ${order.package_name_snapshot}`,
        `Valid until: ${new Date(expiresAt).toLocaleString("en-GB", { timeZone: "Asia/Yangon" })} (Myanmar time)`,
        "",
        "Your access key:",
        key.accessUrl,
        "",
        "Open the official Outline app and import this key. Keep it private.",
      ].join("\n"),
    });
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Approved. Key issued." });
    await telegramApi("editMessageReplyMarkup", { chat_id: adminChatId, message_id: callback.message?.message_id, reply_markup: { inline_keyboard: [] } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await db.from("outline_vpn_orders").update({
      status: "payment_submitted",
      review_note: error instanceof Error ? error.message.slice(0, 500) : "Key issuance failed",
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("status", "approved");
    await telegramApi("sendMessage", {
      chat_id: adminChatId,
      text: `⚠️ Order ${orderId} was approved but key issuance failed. Please check the Outline server configuration and retry after resolving the issue.`,
    });
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Key issuance failed; admin notified.", show_alert: true });
    return NextResponse.json({ ok: true });
  }
}
