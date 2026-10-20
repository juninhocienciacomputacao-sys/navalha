import { supabaseConfigured } from "@/lib/supabase";
import { demoRepo } from "./demo";
import { supabaseRepo } from "./supabase";
import type { Repo } from "./types";

/** Sem as chaves do Supabase o app roda com dados de demonstração. */
export const repo = (): Repo => (supabaseConfigured() ? supabaseRepo : demoRepo);
export * from "./types";
