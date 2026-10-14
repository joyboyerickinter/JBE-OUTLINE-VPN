import { NextResponse } from "next/server";
import { readInitData, validateTelegramInitData } from "@/lib/telegram";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

export async function GET(request: Request) {
  try {
    const user = validateTelegramInitData(readInitData(request));
    const { data, error } = await supabaseAdmin()
      .from("outline_vpn_orders")
      .select("id,package_name_snapshot,duration_days_snapshot,price_mmk,status,created_at,outline_vpn_keys(access_url,expires_at,status)")
      .eq("telegram_user_id", String(user.id))
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return NextResponse.json({ orders: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = validateTelegramInitData(readInitData(request));
    const body = await request.json() as { packageId?: string; paymentProvider?: "KBZPay" | "AYAPay" };
    if (!body.packageId || !["KBZPay", "AYAPay"].includes(String(body.paymentProvider))) {
      return NextResponse.json({ error: "Choose a package and payment method." }, { status: 400 });
    }

    const db = supabaseAdmin();
    const [{ data: pack, error: packageError }, { data: payments, error: paymentError }] = await Promise.all([
      db.from("outline_vpn_packages").select("id,name,duration_days,price_mmk").eq("id", body.packageId).eq("active", true).maybeSingle(),
      db.from("outline_vpn_payment_settings").select("provider,account_name,account_number,instructions").eq("active", true).eq("provider", body.paymentProvider).order("sort_order", { ascending: true }).limit(1),
    ]);
    if (packageError) throw packageError;
    if (paymentError) throw paymentError;
    if (!pack) return NextResponse.json({ error: "That package is no longer available." }, { status: 404 });
    if (!payments?.length) return NextResponse.json({ error: "This payment method is not configured yet." }, { status: 503 });

    const { data: order, error } = await db.from("outline_vpn_orders").insert({
      telegram_user_id: String(user.id),
      telegram_username: user.username ?? null,
      telegram_first_name: user.first_name ?? null,
      package_id: pack.id,
      package_name_snapshot: pack.name,
      duration_days_snapshot: pack.duration_days,
      price_mmk: pack.price_mmk,
      payment_provider: body.paymentProvider,
      status: "awaiting_payment",
    }).select("id,package_name_snapshot,duration_days_snapshot,price_mmk,status").single();
    if (error) throw error;

    return NextResponse.json({ order, payment: payments[0] }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("Telegram") || message.includes("session") || message.includes("signature") || message.includes("Open this app") ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? message : "Could not create the order. Please try again." }, { status });
  }
}
