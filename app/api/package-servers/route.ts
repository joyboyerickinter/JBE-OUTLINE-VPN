import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const packageId = new URL(request.url).searchParams.get("packageId");
    if (!packageId) return NextResponse.json({ error: "Choose a package first." }, { status: 400 });
    const db = supabaseAdmin();
    const { data: pack, error: packageError } = await db.from("outline_vpn_packages")
      .select("id").eq("id", packageId).eq("active", true).maybeSingle();
    if (packageError) throw packageError;
    if (!pack) return NextResponse.json({ error: "That package is no longer available." }, { status: 404 });

    const [{ data: servers, error: serversError }, { data: stockRows, error: stockError }] = await Promise.all([
      db.from("outline_vpn_servers").select("id,name,region,env_slot,active,sort_order").eq("active", true).order("sort_order", { ascending: true }),
      db.from("outline_vpn_package_server_stock").select("server_id,stock_limit").eq("package_id", packageId),
    ]);
    if (serversError) throw serversError;
    if (stockError) throw stockError;

    const stockByServer = new Map((stockRows ?? []).map(row => [row.server_id, row.stock_limit]));
    const now = new Date().toISOString();
    const result = await Promise.all((servers ?? []).map(async server => {
      const stockLimit = stockByServer.get(server.id) ?? 0;
      const { data: activeKeys, error: keysError } = await db.from("outline_vpn_keys")
        .select("order_id").eq("server_id", server.id).eq("status", "active").gt("expires_at", now);
      if (keysError) throw keysError;
      const orderIds = [...new Set((activeKeys ?? []).map(row => row.order_id).filter(Boolean))];
      let used = 0;
      if (orderIds.length) {
        const { data: activeOrders, error: activeOrdersError } = await db.from("outline_vpn_orders")
          .select("id").in("id", orderIds).eq("package_id", packageId).eq("server_id", server.id);
        if (activeOrdersError) throw activeOrdersError;
        used = activeOrders?.length ?? 0;
      }
      const stock = Math.max(0, stockLimit - used);
      return { id: server.id, name: server.name, region: server.region, stock, available: stock > 0 };
    }));
    return NextResponse.json({ servers: result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Package server availability is temporarily unavailable." }, { status: 500 });
  }
}
