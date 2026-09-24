import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Embed one or more texts (no native binaries).
// Preferred: Lovable AI Gateway (LOVABLE_API_KEY, injected in the hosted runtime).
// Local dev fallback: your own OPENAI_API_KEY in .env, so local behaves like the
// hosted site. If neither exists, the caller falls back to lexical ranking.
async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const lovableKey = process.env.LOVABLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!lovableKey && !openaiKey) {
    throw new Error("No embedding API key configured (LOVABLE_API_KEY or OPENAI_API_KEY).");
  }

  const url = lovableKey
    ? "https://ai.gateway.lovable.dev/v1/embeddings"
    : "https://api.openai.com/v1/embeddings";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (lovableKey) headers["Lovable-API-Key"] = lovableKey;
  else headers["Authorization"] = `Bearer ${openaiKey}`;
  const model = lovableKey ? "google/gemini-embedding-2" : "text-embedding-3-small";

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input: chunk }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedding request failed [${res.status}]: ${body}`);
    }
    const json = (await res.json()) as {
      data: { index: number; embedding: number[] }[];
    };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    for (const row of sorted) out.push(row.embedding);
  }
  return out;
}


function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let nA = 0;
  let nB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  return nA && nB ? dot / (Math.sqrt(nA) * Math.sqrt(nB)) : 0;
}

const HelperInput = z.object({
  canHelpWith: z.string().min(10),
  availability: z.string().trim().min(3, "Availability is required").max(500),
});
const HelperRawInput = z.object({
  academicLevel: z.enum(["undergrad", "grad"]),
  age: z.number().int().min(16).max(100),
  major: z.string().min(1).max(120),
  country: z.string().min(1).max(120),
  language: z.string().min(1).max(120),
  interest: z.string().min(1).max(200),
  canHelpWith: z.string().min(10).max(2000),
  availability: z.string().max(500).optional(),
});

const MenteeInput = z.object({
  needsHelpWith: z.string().min(10),
});

// Lexical fallback used when the embedding service is unavailable
// (e.g. local dev without LOVABLE_API_KEY). Keeps "find a helper" working.
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter((t) => t.length > 1);
}

function lexicalScore(query: string, candidate: string): number {
  const q = new Set(tokenize(query));
  const c = new Set(tokenize(candidate));
  if (!q.size || !c.size) return 0;
  let overlap = 0;
  for (const t of q) if (c.has(t)) overlap++;
  return overlap / Math.sqrt(q.size * c.size);
}

async function rankBySimilarity<T>(
  queryText: string,
  candidates: T[],
  textOf: (c: T) => string,
  topK = 5,
): Promise<T[]> {
  if (!candidates.length) return [];
  const score = async (): Promise<number[]> => {
    try {
      const vectors = await embedBatch([queryText, ...candidates.map((c) => textOf(c))]);
      const [queryVec, ...candVecs] = vectors;
      if (!queryVec || candVecs.length !== candidates.length) throw new Error("bad embedding response");
      return candidates.map((_, i) => cosineSim(queryVec, candVecs[i]));
    } catch (err) {
      console.warn("[match] embedding unavailable, falling back to lexical ranking:", err);
      return candidates.map((c) => lexicalScore(queryText, textOf(c)));
    }
  };
  const scores = await score();
  return candidates
    .map((c, i) => ({ c, s: scores[i] }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topK)
    .map(({ c }) => c);
}


type ProfileCore = {
  display_name: string;
  academic_level: string;
  age: number;
  major: string;
  country: string;
  language: string;
  interest: string;
};

async function loadProfileCore(supabase: any, userId: string): Promise<ProfileCore> {
  const { data: p, error } = await supabase
    .from("profiles")
    .select("display_name, academic_level, age, major, country, language, interest")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const missing: string[] = [];
  if (!p?.display_name) missing.push("display name");
  if (!p?.academic_level) missing.push("academic level");
  if (p?.age == null) missing.push("age");
  if (!p?.major) missing.push("major");
  if (!p?.country) missing.push("country");
  if (!p?.language) missing.push("language");
  if (!p?.interest) missing.push("interest");
  if (missing.length) {
    throw new Error(`PROFILE_INCOMPLETE: ${missing.join(", ")}`);
  }
  return p as ProfileCore;
}

export const createHelperProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HelperInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const core = await loadProfileCore(supabase, userId);

    // Enforce 1 helper per user (can_help_with acts as the "is a helper" flag).
    const { data: existing } = await supabase
      .from("profiles")
      .select("can_help_with")
      .eq("id", userId)
      .maybeSingle();
    if ((existing as any)?.can_help_with) throw new Error("You are already a helper.");

    const { error } = await supabase
      .from("profiles")
      .update({
        can_help_with: data.canHelpWith,
        helper_is_active: true,
        helper_availability: data.availability.trim(),
      } as any)
      .eq("id", userId);
    if (error) throw new Error(error.message);

    const { data: mentees } = await supabase.from("mentee_profiles").select("*");
    const newText = `${core.academic_level} ${core.major} ${data.canHelpWith} ${core.country} ${core.language} ${core.interest}`;
    const matches = await rankBySimilarity(
      newText,
      mentees ?? [],
      (m: any) => `${m.academic_level} ${m.major} ${m.needs_help_with} ${m.country ?? ""} ${m.language ?? ""} ${m.interest ?? ""}`,
    );
    return { profile: { id: userId, can_help_with: data.canHelpWith }, matches };
  });

export const createHelperProfileRaw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HelperRawInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("profiles")
      .select("can_help_with")
      .eq("id", userId)
      .maybeSingle();
    if ((existing as any)?.can_help_with) throw new Error("You are already a helper.");

    const { error } = await supabase
      .from("profiles")
      .update({
        academic_level: data.academicLevel,
        age: data.age,
        major: data.major,
        country: data.country,
        language: data.language,
        interest: data.interest,
        can_help_with: data.canHelpWith,
        helper_is_active: true,
        helper_availability: data.availability?.trim() || null,
      } as any)
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { profile: { id: userId, can_help_with: data.canHelpWith } };
  });

export const createMenteeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MenteeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const core = await loadProfileCore(supabase, userId);

    const { data: inserted, error } = await supabase
      .from("mentee_profiles")
      .insert({
        user_id: userId,
        academic_level: core.academic_level,
        age: core.age,
        major: core.major,
        needs_help_with: data.needsHelpWith,
        country: core.country,
        language: core.language,
        interest: core.interest,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Load all helpers straight from profiles (active + non-self).
    const { data: allHelpers } = await supabase
      .from("profiles")
      .select(
        "id, display_name, avatar_url, academic_level, age, major, country, language, interest, can_help_with, helper_is_active, helper_availability",
      )
      .not("can_help_with", "is", null)
      .eq("helper_is_active", true)
      .neq("id", userId);

    const candidateUserIds = (allHelpers ?? []).map((h: any) => h.id);

    // Exclude helpers who are already at the concurrent request cap.
    const MAX_ACTIVE = 3;
    const fullHelperIds = new Set<string>();
    if (candidateUserIds.length) {
      const { data: loadRows } = await supabase
        .from("help_requests")
        .select("helper_user_id, status")
        .in("helper_user_id", candidateUserIds)
        .in("status", ["pending", "accepted"]);
      const counts = new Map<string, number>();
      for (const row of loadRows ?? []) {
        const k = (row as any).helper_user_id as string;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      for (const [k, v] of counts) if (v >= MAX_ACTIVE) fullHelperIds.add(k);
    }

    const helpers = (allHelpers ?? []).filter((h: any) => !fullHelperIds.has(h.id));

    const newText = `${core.academic_level} ${core.major} ${data.needsHelpWith} ${core.country} ${core.language} ${core.interest}`;
    const matches = await rankBySimilarity(
      newText,
      helpers,
      (h: any) => `${h.academic_level} ${h.major} ${h.can_help_with} ${h.country ?? ""} ${h.language ?? ""} ${h.interest ?? ""}`,
    );

    const helperUserIds = Array.from(new Set(matches.map((h: any) => h.id).filter(Boolean)));
    const ratingMap = new Map<string, { avg: number; count: number }>();
    if (helperUserIds.length) {
      const { data: rated } = await supabase
        .from("help_requests")
        .select("helper_user_id, rating")
        .in("helper_user_id", helperUserIds)
        .not("rating", "is", null);
      for (const row of rated ?? []) {
        const k = (row as any).helper_user_id as string;
        const r = (row as any).rating as number;
        const cur = ratingMap.get(k) ?? { avg: 0, count: 0 };
        const count = cur.count + 1;
        ratingMap.set(k, { avg: (cur.avg * cur.count + r) / count, count });
      }
    }
    const matchesWithRating = matches.map((h: any) => {
      const s = ratingMap.get(h.id) ?? { avg: 0, count: 0 };
      return {
        ...h,
        availability: h.helper_availability ?? null,
        avg_rating: s.count ? s.avg : null,
        rating_count: s.count,
      };
    });
    return { profile: inserted, matches: matchesWithRating };
  });

export const getProfileStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ count: helperCount }, { count: menteeCount }, { count: activeHelperCount }] = await Promise.all([
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .not("can_help_with", "is", null),
      supabase.from("mentee_profiles").select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .not("can_help_with", "is", null)
        .eq("helper_is_active", true),
    ]);
    return {
      helperCount: helperCount ?? 0,
      menteeCount: menteeCount ?? 0,
      activeHelperCount: activeHelperCount ?? 0,
    };
  });

export const getMyHelperProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof, error } = await supabase
      .from("profiles")
      .select("can_help_with, helper_is_active, helper_availability")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!prof || !(prof as any).can_help_with) return null;
    return {
      id: userId,
      can_help_with: (prof as any).can_help_with as string,
      is_active: (prof as any).helper_is_active ?? true,
      availability: (prof as any).helper_availability ?? "",
    };
  });

const UpdateHelpInput = z.object({
  canHelpWith: z.string().min(10),
  isActive: z.boolean().optional(),
  availability: z.string().trim().max(500).optional(),
});

export const updateHelperText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateHelpInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Availability is required whenever the helper is (or is being set) active.
    const wantsActive = data.isActive !== false; // undefined = keep, treat as active-guard
    const availabilityProvided = typeof data.availability === "string" && data.availability.trim().length >= 3;
    if (data.isActive === true && !availabilityProvided) {
      throw new Error("Availability is required to be an active helper.");
    }

    const patch: Record<string, any> = { can_help_with: data.canHelpWith };
    if (typeof data.isActive === "boolean") patch.helper_is_active = data.isActive;
    if (typeof data.availability === "string") patch.helper_availability = data.availability.trim() || null;

    // If activating (or already active) and there is no availability at all, reject.
    if (wantsActive) {
      const { data: cur } = await supabase
        .from("profiles")
        .select("helper_availability, helper_is_active")
        .eq("id", userId)
        .maybeSingle();
      const effectiveAvail =
        (typeof data.availability === "string" ? data.availability.trim() : (cur as any)?.helper_availability) ?? "";
      const willBeActive = typeof data.isActive === "boolean" ? data.isActive : !!(cur as any)?.helper_is_active;
      if (willBeActive && effectiveAvail.trim().length < 3) {
        throw new Error("Availability is required to be an active helper.");
      }
    }

    const { error: pErr } = await supabase.from("profiles").update(patch as any).eq("id", userId);
    if (pErr) throw new Error(pErr.message);

    const { data: prof } = await supabase
      .from("profiles")
      .select("can_help_with, helper_is_active, helper_availability")
      .eq("id", userId)
      .maybeSingle();
    return {
      id: userId,
      can_help_with: (prof as any)?.can_help_with ?? data.canHelpWith,
      is_active: (prof as any)?.helper_is_active ?? true,
      availability: (prof as any)?.helper_availability ?? "",
    };
  });

export const quitHelper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Remove any outstanding requests addressed to this helper.
    await supabase.from("help_requests").delete().eq("helper_user_id", userId);
    const { error } = await supabase
      .from("profiles")
      .update({
        can_help_with: null,
        helper_is_active: false,
        helper_availability: null,
      } as any)
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
