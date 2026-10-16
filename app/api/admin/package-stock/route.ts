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
    const [{ data: rows, error: stockError }, { data: servers, error: serverError }] = await Promise.all([
      db.from("outline_vpn_package_server_stock").select("package_id,server_id,stock_limit,updated_at"),
      db.from("outline_vpn_servers").select("id,name,region,env_slot,active,sort_order").order("sort_order", { ascending: true }),
    ]);
    if (stockError) throw stockError;
    if (serverError) throw serverError;
    const now = new Date().toISOString();
    const counts = await Promise.all((servers ?? []).map(async server => {
      const { count, error } = await db.from("outline_vpn_keys").select("id", { count: "exact", head: true })
        .eq("server_id", server.id).eq("status", "active").gt("expires_at", now);
      if (error) throw error;
      return [server.id, count ?? 0] as const;
    }));
    return NextResponse.json({ rows: rows ?? [], servers: servers ?? [], activeKeys: Object.fromEntries(counts) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json({ error: status === 403 ? "Admin access only." : status === 401 ? "Open this admin page inside Telegram." : "Could not load package stock settings. Ensure the package stock migration has been run." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    requireTelegramAdmin(request);
    const body = await request.json() as { package_id?: string; server_id?: string; stock_limit?: number };
    const stock = Number(body.stock_limit);
    if (!body.package_id || !body.server_id || !Number.isInteger(stock) || stock < 0 || stock > 1000000) {
      return NextResponse.json({ error: "Choose a package and server, then enter a stock limit of 0 or more." }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin().from("outline_vpn_package_server_stock").upsert({
      package_id: body.package_id, server_id: body.server_id, stock_limit: stock, updated_at: new Date().toISOString(),
    }, { onConflict: "package_id,server_id" }).select("package_id,server_id,stock_limit").single();
    if (error) throw error;
    return NextResponse.json({ stock: data });
  } catch (error) {
    const status = statusFor(error);
    return NextResponse.json({ error: status === 403 ? "Admin access only." : status === 401 ? "Open this admin page inside Telegram." : "Could not save package stock." }, { status });
  }
}
