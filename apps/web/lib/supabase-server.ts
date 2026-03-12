import { createClient } from "@supabase/supabase-js";

// ローカル(.env.local)は NEXT_PUBLIC_SUPABASE_ANON_KEY、
// Vercel は NEXT_PUBLIC_SUPABASE_KEY で設定されているため両方に対応
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  "";

export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  key,
);
