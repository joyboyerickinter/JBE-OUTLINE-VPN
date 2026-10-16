import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from("outline_vpn_packages")
      .select("id,name,description,duration_days,price_mmk,data_limit_gb")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ packages: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Packages are temporarily unavailable." }, { status: 500 });
  }
}
