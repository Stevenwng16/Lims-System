import type { AuthApi } from "./types";
import { mockAuthApi } from "./mock";
import { supabaseAuthApi } from "./supabase";

// The single swap point: with Supabase env vars configured (.env.local) the
// real backend (lib/auth/supabase.ts + lims-supabase/ migrations) is used;
// without them the app keeps running on the in-memory mock demo.
export const authApi: AuthApi = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? supabaseAuthApi
  : mockAuthApi;

export type * from "./types";
