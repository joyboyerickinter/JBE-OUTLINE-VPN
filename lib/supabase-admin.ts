import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://txxfhxlhlxclzxpekngj.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseAdmin() {
  if (!url || !serviceKey) {
    throw new Error("Supabase server environment variables are not configured.");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
