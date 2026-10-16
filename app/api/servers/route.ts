import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data: servers, error } = await db
      .from("outline_vpn_servers")
      .select("id,name,region,env_slot,stock_limit,active,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;

    const now = new Date().toISOString();
    const result = await Promise.all((servers ?? []).map(async (server) => {
      const { count, error: countError } = await db
        .from("outline_vpn_keys")
        .select("id", { count: "exact", head: true })
        .eq("server_id", server.id)
        .eq("status", "active")
        .gt("expires_at", now);
      if (countError) throw countError;
      return {
        id: server.id,
        name: server.name,
        region: server.region,
        stock: Math.max(0, server.stock_limit - (count ?? 0)),
        available: server.stock_limit - (count ?? 0) > 0,
      };
    }));

    return NextResponse.json({ servers: result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Servers are temporarily unavailable." }, { status: 500 });
  }
}
