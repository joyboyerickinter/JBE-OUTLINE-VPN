import { NextResponse } from "next/server";
import { requireTelegramAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "ADMIN_FORBIDDEN") return 403;
  if (/Telegram|session|signature|Open this app/i.test(message)) return 401;
  return 500;
}

export async function POST(request: Request) {
  try {
    requireTelegramAdmin(request);
    const body = await request.json() as { id?: string; provider?: string; account_name?: string; account_number?: string; instructions?: string; active?: boolean; sort_order?: number };
    const provider = body.provider;
    const accountName = String(body.account_name ?? "").trim();
    const accountNumber = String(body.account_number ?? "").trim();
    if (!["KBZPay", "AYAPay"].includes(String(provider)) || !accountName || accountName.length > 100 || !accountNumber || accountNumber.length > 50) {
      return NextResponse.json({ error: "Enter a valid provider, account name, and account number." }, { status: 400 });
    }
    const values = {
      provider, account_name: accountName, account_number: accountNumber,
      instructions: String(body.instructions ?? "").trim().slice(0, 300),
      active: body.active !== false, sort_order: Number.isInteger(body.sort_order) ? Number(body.sort_order) : 0,
      updated_at: new Date().toISOString(),
    };
    const db = supabaseAdmin();
    const result = body.id
      ? await db.from("outline_vpn_payment_settings").update(values).eq("id", body.id).select("id,provider,account_name,account_number,instructions,active,sort_order").single()
      : await db.from("outline_vpn_payment_settings").insert(values).select("id,provider,account_name,account_number,instructions,active,sort_order").single();
    if (result.error) throw result.error;
    return NextResponse.json({ payment: result.data });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json({ error: status === 403 ? "Admin access only." : status === 401 ? "Open the Mini App from your Telegram admin account." : "Could not save payment settings." }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    requireTelegramAdmin(request);
    const body = await request.json() as { id?: string };
    if (!body.id) return NextResponse.json({ error: "Payment setting ID is required." }, { status: 400 });
    const { error } = await supabaseAdmin().from("outline_vpn_payment_settings").update({ active: false, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json({ error: status === 403 ? "Admin access only." : status === 401 ? "Open the Mini App from your Telegram admin account." : "Could not deactivate payment setting." }, { status });
  }
}
