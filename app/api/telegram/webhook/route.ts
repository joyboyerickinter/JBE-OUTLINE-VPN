import { NextResponse } from "next/server";
import { createOutlineKey, revokeOutlineKey, setOutlineKeyDataLimit } from "@/lib/outline";
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
    .select("id,telegram_user_id,telegram_first_name,package_id,package_name_snapshot,duration_days_snapshot,data_limit_gb_snapshot,price_mmk,status,server_id,server_name_snapshot,server_region_snapshot")
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
    const { data: rejected, error } = await db.from("outline_vpn_orders").update({
      status: "rejected", reviewed_by: String(callback.from?.id ?? ""), reviewed_at: new Date().toISOString(),
      review_note: "Payment proof rejected", updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("status", "payment_submitted").select("id").maybeSingle();
    if (error || !rejected) {
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Order is already being reviewed.", show_alert: true });
      return NextResponse.json({ ok: true });
    }
    await telegramApi("sendMessage", { chat_id: order.telegram_user_id, text: `Your payment proof for order ${orderId} was not approved. Please contact support before placing another order.` });
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Order rejected." });
    await telegramApi("editMessageReplyMarkup", { chat_id: adminChatId, message_id: callback.message?.message_id, reply_markup: { inline_keyboard: [] } });
    return NextResponse.json({ ok: true });
  }

  if (order.status !== "payment_submitted") {
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "This order has already been reviewed.", show_alert: true });
    return NextResponse.json({ ok: true });
  }

  // Atomically claim the order so duplicate Telegram callbacks cannot issue parallel keys.
  const { data: claimed, error: claimError } = await db.from("outline_vpn_orders").update({
    status: "approved", reviewed_by: String(callback.from?.id ?? ""), reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("status", "payment_submitted").select("id").maybeSingle();
  if (claimError || !claimed) {
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Order is already being reviewed.", show_alert: true });
    return NextResponse.json({ ok: true });
  }

  try {
    // Recover safely if a previous attempt created the key but failed while finalizing the order.
    const { data: existingKey, error: existingKeyError } = await db.from("outline_vpn_keys")
      .select("id,access_url,expires_at,status").eq("order_id", orderId).maybeSingle();
    if (existingKeyError) throw existingKeyError;

    let accessUrl = existingKey?.access_url;
    let expiresAt = existingKey?.expires_at;
    if (!existingKey) {
      const { data: available, error: serverError } = await db.from("outline_vpn_servers")
        .select("id,name,region,env_slot,stock_limit,active").eq("id", order.server_id ?? "").eq("active", true).maybeSingle();
      if (serverError) throw serverError;
      if (!available || !process.env[`OUTLINE_SERVER_${available.env_slot}_API_URL`]) throw new Error("The server selected for this order is unavailable or not configured.");
      const { data: stockRow, error: stockRowError } = await db.from("outline_vpn_package_server_stock")
        .select("stock_limit").eq("package_id", order.package_id).eq("server_id", available.id).maybeSingle();
      if (stockRowError) throw stockRowError;
      if (!stockRow || stockRow.stock_limit <= 0) throw new Error("This package has no stock configured on the selected server.");

      const { data: activeKeys, error: activeKeysError } = await db.from("outline_vpn_keys")
        .select("order_id").eq("server_id", available.id).eq("status", "active").gt("expires_at", new Date().toISOString());
      if (activeKeysError) throw activeKeysError;
      const activeOrderIds = [...new Set((activeKeys ?? []).map(row => row.order_id).filter(Boolean))];
      let activeForPackage = 0;
      if (activeOrderIds.length) {
        const { data: activeOrders, error: activeOrdersError } = await db.from("outline_vpn_orders")
          .select("id").in("id", activeOrderIds).eq("package_id", order.package_id).eq("server_id", available.id);
        if (activeOrdersError) throw activeOrdersError;
        activeForPackage = activeOrders?.length ?? 0;
      }
      if (activeForPackage >= stockRow.stock_limit) throw new Error("This package is out of stock on the selected server.");

      const key = await createOutlineKey(available.env_slot, `JBE-${order.telegram_user_id}-${orderId.slice(0, 8)}`);
      try {
        await setOutlineKeyDataLimit(available.env_slot, String(key.id), order.data_limit_gb_snapshot ?? null);
      } catch (limitError) {
        try { await revokeOutlineKey(available.env_slot, String(key.id)); } catch {}
        throw limitError;
      }
      expiresAt = new Date(Date.now() + Number(order.duration_days_snapshot) * 86_400_000).toISOString();
      const { error: keyError } = await db.from("outline_vpn_keys").insert({
        order_id: orderId, server_id: available.id, outline_key_id: key.id, access_url: key.accessUrl,
        status: "active", expires_at: expiresAt,
      });
      if (keyError) {
        try { await revokeOutlineKey(available.env_slot, String(key.id)); } catch {}
        throw keyError;
      }
      accessUrl = key.accessUrl;
    }

    if (!accessUrl || !expiresAt) throw new Error("The stored Outline key is incomplete.");
    const { error: finishError } = await db.from("outline_vpn_orders").update({
      status: "fulfilled", updated_at: new Date().toISOString(), review_note: null,
    }).eq("id", orderId).eq("status", "approved");
    if (finishError) throw finishError;

    // Key and order are committed before sending the customer notification. A Telegram outage
    // must never roll a fulfilled order back and trigger duplicate key creation.
    let customerNotified = true;
    try {
      await telegramApi("sendMessage", {
        chat_id: order.telegram_user_id,
        text: [
          "✅ Your JBE Outline VPN key is ready!",
          `Package: ${order.package_name_snapshot}`,
          `Valid until: ${new Date(expiresAt).toLocaleString("en-GB", { timeZone: "Asia/Yangon" })} (Myanmar time)`,
          "",
          "Your access key:",
          accessUrl,
          "",
          "Open the official Outline app and import this key. Keep it private.",
        ].join("\n"),
      });
    } catch {
      customerNotified = false;
    }
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: customerNotified ? "Approved. Key issued." : "Key issued, but customer notification failed.",
      show_alert: !customerNotified,
    });
    if (customerNotified) {
      await telegramApi("editMessageReplyMarkup", { chat_id: adminChatId, message_id: callback.message?.message_id, reply_markup: { inline_keyboard: [] } });
    } else {
      await telegramApi("sendMessage", {
        chat_id: adminChatId,
        text: `⚠️ Order ${orderId} is fulfilled and its key is saved, but Telegram could not deliver the key to the customer. Check the order in the Mini App before taking action.`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Key issuance failed";
    const { data: savedKey } = await db.from("outline_vpn_keys").select("id").eq("order_id", orderId).maybeSingle();
    if (savedKey) {
      // Never reset an order that already has a key: that would permit duplicate key attempts.
      await db.from("outline_vpn_orders").update({
        status: "fulfilled", review_note: "Key saved; finalization or notification needs admin review.",
        updated_at: new Date().toISOString(),
      }).eq("id", orderId).eq("status", "approved");
      await telegramApi("sendMessage", {
        chat_id: adminChatId,
        text: `⚠️ Order ${orderId} has a saved key but needs a delivery/finalization check. Do not approve it again or create another key. Error: ${message}`,
      });
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Key exists; admin notified to check delivery.", show_alert: true });
      return NextResponse.json({ ok: true });
    }

    await db.from("outline_vpn_orders").update({
      status: "payment_submitted", review_note: message, updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("status", "approved");
    await telegramApi("sendMessage", {
      chat_id: adminChatId,
      text: `⚠️ Order ${orderId} key issuance failed before a key was saved. Please check the Outline server configuration, then retry. Error: ${message}`,
    });
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Key issuance failed; admin notified.", show_alert: true });
    return NextResponse.json({ ok: true });
  }
}
