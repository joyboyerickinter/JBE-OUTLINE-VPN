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

export async function GET(request: Request) {
  try {
    requireTelegramAdmin(request);
    const db = supabaseAdmin();
    const [{ data: packages, error: packagesError }, { data: payments, error: paymentsError }] = await Promise.all([
      db.from("outline_vpn_packages").select("id,name,description,duration_days,price_mmk,active,sort_order,created_at").order("sort_order", { ascending: true }),
      db.from("outline_vpn_payment_settings").select("id,provider,account_name,account_number,instructions,active,sort_order,updated_at").order("sort_order", { ascending: true }),
    ]);
    if (packagesError || paymentsError) throw new Error("Could not load admin settings.");
    return NextResponse.json({ packages: packages ?? [], payments: payments ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json({ error: status === 403 ? "Admin access only." : status === 401 ? "Open the Mini App from your Telegram admin account." : "Could not load settings." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    requireTelegramAdmin(request);
    const body = await request.json() as { id?: string; name?: string; description?: string; duration_days?: number; price_mmk?: number; active?: boolean; sort_order?: number };
    const name = String(body.name ?? "").trim();
    const duration = Number(body.duration_days);
    const price = Number(body.price_mmk);
    if (!name || name.length > 80 || !Number.isInteger(duration) || duration < 1 || duration > 3650 || !Number.isInteger(price) || price < 0 || price > 100000000) {
      return NextResponse.json({ error: "Enter a package name, valid duration, and whole-number MMK price." }, { status: 400 });
    }
    const values = {
      name, description: String(body.description ?? "").trim().slice(0, 240), duration_days: duration,
      price_mmk: price, active: body.active !== false, sort_order: Number.isInteger(body.sort_order) ? Number(body.sort_order) : 0,
      updated_at: new Date().toISOString(),
    };
    const db = supabaseAdmin();
    const result = body.id
      ? await db.from("outline_vpn_packages").update(values).eq("id", body.id).select("id,name,description,duration_days,price_mmk,active,sort_order").single()
      : await db.from("outline_vpn_packages").insert(values).select("id,name,description,duration_days,price_mmk,active,sort_order").single();
    if (result.error) throw result.error;
    return NextResponse.json({ package: result.data });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json({ error: status === 403 ? "Admin access only." : status === 401 ? "Open the Mini App from your Telegram admin account." : "Could not save package." }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    requireTelegramAdmin(request);
    const body = await request.json() as { id?: string };
    if (!body.id) return NextResponse.json({ error: "Package ID is required." }, { status: 400 });
    const { error } = await supabaseAdmin().from("outline_vpn_packages").update({ active: false, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json({ error: status === 403 ? "Admin access only." : status === 401 ? "Open the Mini App from your Telegram admin account." : "Could not deactivate package." }, { status });
  }
}
