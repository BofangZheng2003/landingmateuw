import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Maximum number of concurrent active (pending or accepted) help
// relationships a helpee can send or a helper can receive.
export const MAX_ACTIVE_REQUESTS = 3;
const ACTIVE_STATUSES: ("pending" | "accepted")[] = ["pending", "accepted"];

const RequestHelpInput = z.object({
  helperUserIds: z.array(z.string().uuid()).min(1).max(5),
});

export const requestHelp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RequestHelpInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load mentee's profile (most recent)
    const { data: menteeProfile, error: mErr } = await supabase
      .from("mentee_profiles")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!menteeProfile) throw new Error("Create a mentee profile first.");

    // Check mentee's current active requests (pending + accepted).
    const { data: activeSent } = await supabase
      .from("help_requests")
      .select("id, status")
      .eq("mentee_user_id", userId)
      .in("status", ACTIVE_STATUSES);
    if ((activeSent ?? []).some((r: any) => r.status === "accepted")) {
      throw new Error("You already have an accepted helper.");
    }
    const activeSentCount = (activeSent ?? []).length;
    if (activeSentCount >= MAX_ACTIVE_REQUESTS) {
      throw new Error(
        `You already have ${MAX_ACTIVE_REQUESTS} active help requests. Cancel one before sending more.`,
      );
    }
    const remainingSlots = MAX_ACTIVE_REQUESTS - activeSentCount;

    // Verify each candidate is really a helper.
    const { data: helpers, error: hErr } = await supabase
      .from("profiles")
      .select("id, can_help_with")
      .in("id", data.helperUserIds)
      .not("can_help_with", "is", null);
    if (hErr) throw new Error(hErr.message);
    if (!helpers || helpers.length === 0) throw new Error("No helpers found.");

    const rows = helpers.map((h: any) => ({
      mentee_user_id: userId,
      helper_user_id: h.id as string,
      mentee_profile_id: menteeProfile.id,
    }));

    // Only current requests should block a new request. Delete stale
    // cancelled/rejected rows so the mentee can re-request the same helper.
    const helperUserIds = rows.map((r) => r.helper_user_id);
    const { data: existing, error: eErr } = await supabase
      .from("help_requests")
      .select("id, helper_user_id, status")
      .eq("mentee_user_id", userId)
      .in("helper_user_id", helperUserIds);
    if (eErr) throw new Error(eErr.message);
    const staleIds = (existing ?? [])
      .filter((r: any) => r.status === "cancelled" || r.status === "rejected")
      .map((r: any) => r.id);
    if (staleIds.length > 0) {
      await supabase.from("help_messages").delete().in("request_id", staleIds);
      await supabase.from("help_requests").delete().in("id", staleIds);
    }
    const blockingSet = new Set(
      (existing ?? [])
        .filter((r: any) => r.status === "pending" || r.status === "accepted")
        .map((r: any) => r.helper_user_id),
    );
    let toInsert = rows.filter((r) => !blockingSet.has(r.helper_user_id));

    // Filter out helpers who are already at the active-request cap.
    const candidateHelperUserIds = Array.from(new Set(toInsert.map((r) => r.helper_user_id)));
    const fullHelpers = new Set<string>();
    if (candidateHelperUserIds.length > 0) {
      const { data: helperLoad } = await supabase
        .from("help_requests")
        .select("helper_user_id, status")
        .in("helper_user_id", candidateHelperUserIds)
        .in("status", ACTIVE_STATUSES);
      const counts = new Map<string, number>();
      for (const row of helperLoad ?? []) {
        const k = (row as any).helper_user_id as string;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      for (const [k, v] of counts) if (v >= MAX_ACTIVE_REQUESTS) fullHelpers.add(k);
    }
    const atCapCount = toInsert.filter((r) => fullHelpers.has(r.helper_user_id)).length;
    toInsert = toInsert.filter((r) => !fullHelpers.has(r.helper_user_id));

    // Respect the mentee's remaining slots.
    const cappedByMentee = Math.max(0, toInsert.length - remainingSlots);
    if (cappedByMentee > 0) toInsert = toInsert.slice(0, remainingSlots);

    let inserted: any[] = [];
    if (toInsert.length > 0) {
      const { data: ins, error: iErr } = await supabase
        .from("help_requests")
        .insert(toInsert as any)
        .select();
      if (iErr) throw new Error(iErr.message);
      inserted = ins ?? [];
    }
    return {
      inserted,
      skipped: blockingSet.size,
      requested: rows.length,
      atCap: atCapCount,
      menteeCapped: cappedByMentee,
    };
  });

const IdInput = z.object({ requestId: z.string().uuid() });

export const acceptHelpRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error: rErr } = await supabase
      .from("help_requests")
      .select("*")
      .eq("id", data.requestId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!req) throw new Error("Request not found.");
    if (req.helper_user_id !== userId) throw new Error("Not authorized.");
    if (req.status !== "pending") throw new Error("Request is no longer pending.");

    // Enforce helper cap: max concurrent accepted matches.
    const { count: acceptedCount } = await supabase
      .from("help_requests")
      .select("*", { count: "exact", head: true })
      .eq("helper_user_id", userId)
      .eq("status", "accepted");
    if ((acceptedCount ?? 0) >= MAX_ACTIVE_REQUESTS) {
      throw new Error(
        `You already have ${MAX_ACTIVE_REQUESTS} active helpees. End one before accepting another.`,
      );
    }

    const { error: aErr } = await supabase
      .from("help_requests")
      .update({ status: "accepted" })
      .eq("id", data.requestId);
    if (aErr) throw new Error(aErr.message);

    // Cancel and hide all other pending requests from the same mentee.
    const { error: cErr } = await supabase
      .from("help_requests")
      .update({ status: "cancelled", mentee_hidden: true, helper_hidden: true })
      .eq("mentee_user_id", req.mentee_user_id)
      .eq("status", "pending")
      .neq("id", data.requestId);
    if (cErr) throw new Error(cErr.message);

    return { ok: true };
  });

export const rejectHelpRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req } = await supabase
      .from("help_requests")
      .select("helper_user_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Request not found.");
    if (req.helper_user_id !== userId) throw new Error("Not authorized.");
    if (req.status !== "pending") throw new Error("Request is no longer pending.");

    const { error } = await supabase
      .from("help_requests")
      .update({ status: "rejected" })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };

  });

export const cancelHelpRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req } = await supabase
      .from("help_requests")
      .select("mentee_user_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Request not found.");
    if (req.mentee_user_id !== userId) throw new Error("Not authorized.");
    if (req.status === "accepted") throw new Error("Cannot cancel an accepted request.");

    await supabase.from("help_messages").delete().eq("request_id", data.requestId);
    const { error } = await supabase
      .from("help_requests")
      .delete()
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [sentRes, recvRes] = await Promise.all([
      supabase
        .from("help_requests")
        .select("*")
        .eq("mentee_user_id", userId)
        .eq("mentee_hidden", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("help_requests")
        .select("*")
        .eq("helper_user_id", userId)
        .eq("helper_hidden", false)
        .order("created_at", { ascending: false }),
    ]);
    const sentRows = sentRes.data ?? [];
    const receivedRows = recvRes.data ?? [];

    const all = [...sentRows, ...receivedRows];
    const menteeIds = Array.from(new Set(all.map((r) => r.mentee_profile_id)));
    const userIds = Array.from(new Set(all.flatMap((r) => [r.helper_user_id, r.mentee_user_id])));
    const [{ data: mentees }, { data: profiles }] = await Promise.all([
      menteeIds.length
        ? supabase.from("mentee_profiles").select("*").in("id", menteeIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name, avatar_url, academic_level, age, major, can_help_with")
            .in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const menteeMap = new Map((mentees ?? []).map((m: any) => [m.id, m]));
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const decorate = (r: any) => ({
      ...r,
      // helper_profile mirrors the shape match.tsx expects (major, academic_level, age, can_help_with)
      helper_profile: profileMap.get(r.helper_user_id) ?? null,
      mentee_profile: menteeMap.get(r.mentee_profile_id) ?? null,
      helper_user_profile: profileMap.get(r.helper_user_id) ?? null,
      mentee_user_profile: profileMap.get(r.mentee_user_id) ?? null,
    });
    return {
      sent: sentRows.map(decorate),
      received: receivedRows.map(decorate),
    };
  });

// End an accepted (or any active) match. Either party may end.
export const endHelpRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error } = await supabase
      .from("help_requests")
      .select("*")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!req) throw new Error("Request not found.");
    const isHelper = req.helper_user_id === userId;
    const isMentee = req.mentee_user_id === userId;
    if (!isHelper && !isMentee) throw new Error("Not authorized.");

    const patch: { status: "ended" | "over" } = isHelper
      ? { status: "ended" }
      : { status: "over" };

    const { error: uErr } = await supabase
      .from("help_requests")
      .update(patch)
      .eq("id", data.requestId);
    if (uErr) throw new Error(uErr.message);

    await supabase.from("help_messages").delete().eq("request_id", data.requestId);
    return { ok: true };
  });

const RateInput = z.object({
  requestId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
});

export const rateHelpRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req } = await supabase
      .from("help_requests")
      .select("mentee_user_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Request not found.");
    if (req.mentee_user_id !== userId) throw new Error("Only the mentee can rate.");
    const { error } = await supabase
      .from("help_requests")
      .update({ rating: data.rating, mentee_hidden: true })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dismissHelpRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req } = await supabase
      .from("help_requests")
      .select("mentee_user_id, helper_user_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Request not found.");
    const patch: { mentee_hidden?: boolean; helper_hidden?: boolean } = {};
    if (req.mentee_user_id === userId) patch.mentee_hidden = true;
    else if (req.helper_user_id === userId) patch.helper_hidden = true;
    else throw new Error("Not authorized.");
    const { error } = await supabase
      .from("help_requests")
      .update(patch)
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("help_messages")
      .select("*")
      .eq("request_id", data.requestId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const senderIds = Array.from(new Set((rows ?? []).map((r) => r.sender_user_id)));
    const { data: profs } = senderIds.length
      ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", senderIds)
      : ({ data: [] as any[] } as any);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const messages = (rows ?? []).map((r) => ({ ...r, sender_profile: map.get(r.sender_user_id) ?? null }));
    return { messages };
  });

const SendMessageInput = z.object({
  requestId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendMessageInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("help_messages")
      .insert({
        request_id: data.requestId,
        sender_user_id: userId,
        body: data.body,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { message: row };
  });
