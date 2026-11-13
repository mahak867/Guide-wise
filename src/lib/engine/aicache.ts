import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * Cache for AI answers. The same rule on the same (already redacted) text gets the same answer,
 * so many people reviewing the same sample do not spend the AI quota again.
 * Two layers: memory in this server instance, and the ai_cache table when it exists.
 * Both fail open: any cache problem means the AI is simply called.
 */
const VERSION = "v1";
const memory = new Map<string, unknown>();
const MAX_MEMORY = 500;

let client: SupabaseClient | null | undefined;
let tableMissing = false;
function table() {
  if (tableMissing) return null;
  if (client === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return client?.from("ai_cache") ?? null;
}

export function cacheOn(): boolean {
  return process.env.GUIDEWISE_AI_CACHE !== "off";
}

export function cacheKey(parts: (string | number)[]): string {
  return createHash("sha256").update([VERSION, ...parts].join("\u0001")).digest("hex");
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const t = table();
    if (!t) return undefined;
    const { data, error } = await t.select("value").eq("key", key).maybeSingle();
    if (error) { tableMissing = true; return undefined; } // table not created yet: memory only
    if (data) { remember(key, data.value); return data.value as T; }
  } catch { /* fail open */ }
  return undefined;
}

export async function cacheSet(key: string, value: unknown, task: string): Promise<void> {
  remember(key, value);
  try {
    const t = table();
    if (t) { const { error } = await t.upsert({ key, task, value }); if (error) tableMissing = true; }
  } catch { /* fail open */ }
}

function remember(key: string, value: unknown) {
  if (memory.size >= MAX_MEMORY) memory.delete(memory.keys().next().value as string);
  memory.set(key, value);
}
