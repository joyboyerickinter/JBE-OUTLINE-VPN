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
    const { data: servers, error } = await db.from("outline_vpn_servers")
      .select("id,name,region,env_slot,stock_limit,active,sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const now = new Date().toISOString();
    const items = await Promise.all((servers ?? []).map(async (server) => {
      const { count, error: countError } = await db.from("outline_vpn_keys")
        .select("id", { count: "exact", head: true })
        .eq("server_id", server.id).eq("status", "active").gt("expires_at", now);
      if (countError) throw countError;
      return { ...server, active_keys: count ?? 0, available_stock: Math.max(0, server.stock_limit - (count ?? 0)) };
    }));
    return NextResponse.json({ servers: items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json({ error: status === 403 ? "Admin access only." : status === 401 ? "Open the Mini App from your Telegram admin account." : "Could not load server settings." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    requireTelegramAdmin(request);
    const body = await request.json() as { id?: string; name?: string; region?: string; stock_limit?: number; active?: boolean; sort_order?: number };
    const name = String(body.name ?? "").trim();
    const region = String(body.region ?? "").trim();
    const stock = Number(body.stock_limit);
    const sort = Number(body.sort_order ?? 0);
    if (!body.id || !name || name.length > 80 || !["Singapore", "Other"].includes(region) || !Number.isInteger(stock) || stock < 0 || stock > 1000000 || !Number.isInteger(sort)) {
      return NextResponse.json({ error: "Enter a server name, valid region, non-negative stock limit and display order." }, { status: 400 });
    }
    const db = supabaseAdmin();
    const { data, error } = await db.from("outline_vpn_servers").update({
      name, region, stock_limit: stock, active: body.active === true, sort_order: sort,
    }).eq("id", body.id).select("id,name,region,env_slot,stock_limit,active,sort_order").single();
    if (error) throw error;
    return NextResponse.json({ server: data });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json({ error: status === 403 ? "Admin access only." : status === 401 ? "Open the Mini App from your Telegram admin account." : "Could not save server settings." }, { status });
  }
}
