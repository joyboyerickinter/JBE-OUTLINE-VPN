import { NextResponse } from "next/server";
import { revokeOutlineKey } from "@/lib/outline";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data: expired, error } = await db.from("outline_vpn_keys")
    .select("id,order_id,outline_key_id,server_id,outline_vpn_servers(env_slot)")
    .eq("status", "active")
    .lte("expires_at", new Date().toISOString())
    .limit(100);
  if (error) return NextResponse.json({ error: "Could not load expired keys." }, { status: 500 });

  let revoked = 0;
  const failures: string[] = [];
  for (const key of expired ?? []) {
    const server = Array.isArray(key.outline_vpn_servers) ? key.outline_vpn_servers[0] : key.outline_vpn_servers;
    if (!server?.env_slot) { failures.push(key.id); continue; }
    try {
      await revokeOutlineKey(Number(server.env_slot), String(key.outline_key_id));
      const { error: updateError } = await db.from("outline_vpn_keys").update({
        status: "expired", revoked_at: new Date().toISOString(),
      }).eq("id", key.id).eq("status", "active");
      if (updateError) throw updateError;
      await db.from("outline_vpn_orders").update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", key.order_id).eq("status", "fulfilled");
      revoked += 1;
    } catch {
      failures.push(key.id);
    }
  }
  if (failures.length) return NextResponse.json({ ok: false, revoked, failed: failures.length }, { status: 500 });
  return NextResponse.json({ ok: true, revoked });
}
