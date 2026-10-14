import { NextResponse } from "next/server";
import { readInitData, telegramApi, validateTelegramInitData } from "@/lib/telegram";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let uploadedPath: string | null = null;
  let orderIdForRollback: string | null = null;
  try {
    const user = validateTelegramInitData(readInitData(request));
    const { id } = await context.params;
    orderIdForRollback = id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid order." }, { status: 400 });

    const form = await request.formData();
    const file = form.get("screenshot");
    if (!(file instanceof File)) return NextResponse.json({ error: "Select a payment screenshot." }, { status: 400 });
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Use a JPG, PNG or WEBP image up to 5 MB." }, { status: 400 });
    }
    const provider = form.get("provider");
    if (provider !== "KBZPay" && provider !== "AYAPay") return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });

    const db = supabaseAdmin();
    const { data: order, error: orderError } = await db.from("outline_vpn_orders")
      .select("id,telegram_user_id,package_name_snapshot,duration_days_snapshot,price_mmk,status,payment_provider")
      .eq("id", id).eq("telegram_user_id", String(user.id)).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.status !== "awaiting_payment" || order.payment_provider !== provider) {
      return NextResponse.json({ error: "This order is not waiting for payment proof." }, { status: 409 });
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    uploadedPath = `${id}/${Date.now()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await db.storage.from("outline-vpn-payment-proofs").upload(uploadedPath, bytes, {
      contentType: file.type, upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: updatedOrder, error: updateError } = await db.from("outline_vpn_orders").update({
      payment_proof_path: uploadedPath, status: "payment_submitted", updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "awaiting_payment").select("id").maybeSingle();
    if (updateError) throw updateError;
    if (!updatedOrder) throw new Error("This order is no longer waiting for payment proof.");

    const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminChat) throw new Error("Admin Telegram chat is not configured.");
    const { data: signed, error: signedError } = await db.storage.from("outline-vpn-payment-proofs").createSignedUrl(uploadedPath, 60 * 60);
    if (signedError || !signed?.signedUrl) throw new Error("Could not prepare payment proof for review.");

    await telegramApi("sendPhoto", {
      chat_id: adminChat,
      photo: signed.signedUrl,
      caption: [
        "🧾 New Outline VPN payment",
        `Order: ${id}`,
        `Customer: ${user.first_name ?? "Telegram user"}${user.username ? ` (@${user.username})` : ""}`,
        `Telegram ID: ${user.id}`,
        `Package: ${order.package_name_snapshot}`,
        `Duration: ${order.duration_days_snapshot} days`,
        `Amount: ${Number(order.price_mmk).toLocaleString("en-US")} MMK`,
        `Payment: ${provider}`,
      ].join("\n"),
      reply_markup: { inline_keyboard: [[
        { text: "✅ Approve & issue key", callback_data: `ov:approve:${id}` },
        { text: "❌ Reject", callback_data: `ov:reject:${id}` },
      ]] },
    });

    return NextResponse.json({ success: true, message: "Payment proof sent for admin review." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (uploadedPath) {
      try {
        const db = supabaseAdmin();
        if (orderIdForRollback) {
          await db.from("outline_vpn_orders").update({
            payment_proof_path: null, status: "awaiting_payment", updated_at: new Date().toISOString(),
          }).eq("id", orderIdForRollback).eq("status", "payment_submitted").eq("payment_proof_path", uploadedPath);
        }
        await db.storage.from("outline-vpn-payment-proofs").remove([uploadedPath]);
      } catch {}
    }
    const message = error instanceof Error ? error.message : "Upload failed.";
    const authError = /Telegram|session|signature|Open this app/i.test(message);
    return NextResponse.json({ error: authError ? message : "Could not submit the screenshot. Please try again." }, { status: authError ? 401 : 500 });
  }
}
