import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, X, Clock, GraduationCap, BookOpen, Send, Star, MessageSquare } from "lucide-react";
import {
  getMyRequests,
  acceptHelpRequest,
  rejectHelpRequest,
  cancelHelpRequest,
  endHelpRequest,
  rateHelpRequest,
  dismissHelpRequest,
  getMessages,
  sendMessage,
} from "@/lib/help-requests.functions";

export const Route = createFileRoute("/match")({
  head: () => ({
    meta: [
      { title: "Match — PeerBridge" },
      { name: "description", content: "Review your help requests and matches." },
    ],
  }),
  component: MatchPage,
});

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    accepted: "bg-emerald-100 text-emerald-800 border-emerald-200",
    rejected: "bg-rose-100 text-rose-700 border-rose-200",
    cancelled: "bg-slate-100 text-slate-600 border-slate-200",
    ended: "bg-slate-100 text-slate-600 border-slate-200",
    over: "bg-indigo-100 text-indigo-700 border-indigo-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] ?? ""}`}>
      <Clock className="w-3 h-3" /> {status}
    </span>
  );
}

type Req = any;

function MatchPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setUserId(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSignedIn(!!s);
      setUserId(s?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const fn = useServerFn(getMyRequests);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-requests"],
    queryFn: () => fn(),
    enabled: signedIn,
  });

  const acceptFn = useServerFn(acceptHelpRequest);
  const rejectFn = useServerFn(rejectHelpRequest);
  const cancelFn = useServerFn(cancelHelpRequest);
  const endFn = useServerFn(endHelpRequest);
  const rateFn = useServerFn(rateHelpRequest);
  const dismissFn = useServerFn(dismissHelpRequest);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-requests"] });
  const accept = useMutation({ mutationFn: (id: string) => acceptFn({ data: { requestId: id } }), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: (id: string) => rejectFn({ data: { requestId: id } }), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: (id: string) => cancelFn({ data: { requestId: id } }), onSuccess: invalidate });
  const end = useMutation({
    mutationFn: (id: string) => endFn({ data: { requestId: id } }),
    onSuccess: (_r, id) => {
      invalidate();
      qc.setQueryData(["messages", id], { messages: [] });
    },
  });
  const rate = useMutation({
    mutationFn: (v: { requestId: string; rating: number }) => rateFn({ data: v }),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { requestId: id } }),
    onSuccess: invalidate,
  });

  const [confirmEnd, setConfirmEnd] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);

  const sent: Req[] = q.data?.sent ?? [];
  const received: Req[] = q.data?.received ?? [];

  const activeReq = useMemo(() => {
    return (
      sent.find((r) => r.id === activeChat) ??
      received.find((r) => r.id === activeChat) ??
      null
    );
  }, [activeChat, sent, received]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [chatWidth, setChatWidth] = useState(() => {
    if (typeof window === "undefined") return 480;
    const saved = Number(localStorage.getItem("match-chat-width"));
    return Number.isFinite(saved) && saved > 0 ? Math.max(320, Math.min(800, saved)) : 480;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setChatWidth(Math.max(320, Math.min(800, rect.right - e.clientX)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    localStorage.setItem("match-chat-width", String(chatWidth));
  }, [chatWidth]);

  if (!signedIn) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold mb-4">Match</h1>
        <p className="text-muted-foreground mb-6">Sign in to view your help requests.</p>
        <Link to="/auth" className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-medium">
          Sign in
        </Link>
      </div>
    );
  }

  const chatOpenable = (r: Req) => r && (r.status === "accepted" || r.status === "over");

  const renderCard = (r: Req, kind: "sent" | "received") => {
    const profile = kind === "sent" ? r.helper_profile : r.mentee_profile;
    const label = kind === "sent" ? "Helper" : "Helpee";
    const bodyText = kind === "sent" ? profile?.can_help_with : profile?.needs_help_with;
    const canChat = chatOpenable(r);
    const canEnd = r.status === "accepted" || (kind === "sent" && r.status === "over");
    const isActive = activeChat === r.id;
    const isTerminal = r.status === "rejected" || r.status === "ended" || r.status === "over" || r.status === "cancelled";
    const showDismiss = isTerminal && !(kind === "sent" && (r.status === "over" || r.status === "ended"));

    return (
      <li
        key={r.id}
        className={`relative rounded-2xl border p-5 bg-card flex flex-col gap-3 transition ${
          isActive ? "ring-2 ring-primary border-primary" : ""
        } ${canChat ? "cursor-pointer hover:border-primary/60" : ""}`}
        onClick={() => canChat && setActiveChat(r.id)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium truncate">{profile?.major ?? label}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {profile?.academic_level} · Age {profile?.age}
            </p>
          </div>
          {statusBadge(r.status)}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-3">{bodyText}</p>

        {kind === "received" && r.status === "pending" && (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" onClick={() => accept.mutate(r.id)} disabled={accept.isPending || reject.isPending}>
              <Check className="w-4 h-4 mr-1" /> Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => reject.mutate(r.id)} disabled={accept.isPending || reject.isPending}>
              <X className="w-4 h-4 mr-1" /> Reject
            </Button>
          </div>
        )}

        {kind === "sent" && r.status === "pending" && (
          <div onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending}>
              Cancel
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {canChat && (
            <Button variant="ghost" size="sm" onClick={() => setActiveChat(r.id)}>
              <MessageSquare className="w-4 h-4 mr-1" /> Chat
            </Button>
          )}
          {canEnd && (
            <Button variant="outline" size="sm" onClick={() => setConfirmEnd(r.id)}>
              End
            </Button>
          )}
        </div>

        {kind === "sent" && (r.status === "over" || r.status === "ended") && (
          <div onClick={(e) => e.stopPropagation()}>
            <RatingRow
              value={r.rating ?? 0}
              onChange={(v) => rate.mutate({ requestId: r.id, rating: v })}
              onDismiss={() => dismiss.mutate(r.id)}
              disabled={rate.isPending || dismiss.isPending}
            />
          </div>
        )}

        {showDismiss && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismiss.mutate(r.id);
            }}
            disabled={dismiss.isPending}
            className="absolute bottom-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
            aria-label="Dismiss record"
            title="Remove record"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </li>
    );
  };


  return (
    <div className="h-screen flex flex-col">
      <header className="px-6 pt-6 pb-4 shrink-0">
        <h1 className="text-4xl font-semibold tracking-tight">Match</h1>
      </header>

      <main className={`flex-1 overflow-hidden px-6 pb-6 ${dragging ? "select-none" : ""}`}>
        <div ref={containerRef} className="flex h-full gap-0">
          <div className="flex-1 min-w-0 overflow-y-auto pr-4 space-y-14">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-primary" />
                <h2 className="text-2xl font-medium">Requests you sent</h2>
              </div>
              {q.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : sent.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No requests yet. Head to <Link to="/help" className="underline">Help</Link> to find a Helper.
                </p>
              ) : (
                <ul className="grid sm:grid-cols-2 gap-4">
                  {groupSentByRequest(sent).map((g) => (
                    <SentRequestCard
                      key={g.key}
                      group={g}
                      activeChat={activeChat}
                      onOpenChat={setActiveChat}
                      onCancel={(id) => cancel.mutate(id)}
                      onEnd={(id) => setConfirmEnd(id)}
                      onRate={(id, r) => rate.mutate({ requestId: id, rating: r })}
                      onDismiss={(id) => dismiss.mutate(id)}
                      busy={cancel.isPending || rate.isPending || dismiss.isPending}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="w-5 h-5 text-primary" />
                <h2 className="text-2xl font-medium">Requests you received</h2>
              </div>
              {q.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : received.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No incoming requests yet.</p>
              ) : (
                <ul className="grid sm:grid-cols-2 gap-4">{received.map((r) => renderCard(r, "received"))}</ul>
              )}
            </section>
          </div>


          <div
            className={`w-2 shrink-0 flex items-center justify-center cursor-col-resize select-none ${dragging ? "bg-primary/40" : "bg-border hover:bg-primary/30"}`}
            onMouseDown={() => setDragging(true)}
            title="Drag to resize"
          >
            <div className="w-0.5 h-8 rounded-full bg-muted-foreground/40" />
          </div>

          <aside style={{ width: chatWidth }} className="shrink-0 overflow-hidden pl-4">
            <ChatPanel
              request={activeReq}
              currentUserId={userId}
              onClose={() => setActiveChat(null)}
            />
          </aside>
        </div>
      </main>

      <AlertDialog open={!!confirmEnd} onOpenChange={(o) => !o && setConfirmEnd(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this match?</AlertDialogTitle>
            <AlertDialogDescription>
              This ends the connection and clears the chat history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmEnd) {
                  if (activeChat === confirmEnd) setActiveChat(null);
                  end.mutate(confirmEnd);
                }
                setConfirmEnd(null);
              }}
            >
              End match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type SentGroup = {
  key: string;
  needsHelpWith: string;
  createdAt: string;
  requests: Req[];
};

function groupSentByRequest(sent: Req[]): SentGroup[] {
  const map = new Map<string, SentGroup>();
  for (const r of sent) {
    const key = r.mentee_profile_id ?? r.id;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        needsHelpWith: r.mentee_profile?.needs_help_with ?? "",
        createdAt: r.created_at,
        requests: [],
      };
      map.set(key, g);
    }
    g.requests.push(r);
    if (r.created_at > g.createdAt) g.createdAt = r.created_at;
  }
  return Array.from(map.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function truncate(text: string, n = 140) {
  if (!text) return "";
  return text.length > n ? text.slice(0, n).trimEnd() + "…" : text;
}

function SentRequestCard({
  group,
  activeChat,
  onOpenChat,
  onCancel,
  onEnd,
  onRate,
  onDismiss,
  busy,
}: {
  group: SentGroup;
  activeChat: string | null;
  onOpenChat: (id: string) => void;
  onCancel: (id: string) => void;
  onEnd: (id: string) => void;
  onRate: (id: string, rating: number) => void;
  onDismiss: (id: string) => void;
  busy: boolean;
}) {
  const accepted = group.requests.find((r) => r.status === "accepted" || r.status === "over" || r.status === "ended");
  const pending = group.requests.filter((r) => r.status === "pending");
  const terminalOnly = !accepted && pending.length === 0;
  const summaryStatus = accepted ? accepted.status : pending.length > 0 ? "pending" : group.requests[0]?.status ?? "pending";
  const fullText = group.needsHelpWith || "(no description)";

  return (
    <li className="relative rounded-2xl border p-5 bg-card flex flex-col gap-3">

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Your request</p>
          <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap" title={fullText}>
            {truncate(fullText, 220)}
          </p>
        </div>
        {statusBadge(summaryStatus)}
      </div>

      <div className="border-t pt-3 space-y-2">
        {accepted ? (
          (() => {
            const r = accepted;
            const p = r.helper_user_profile ?? r.helper_profile;
            const name = p?.display_name?.trim() || "Helper";
            const isActive = activeChat === r.id;
            const canChat = r.status === "accepted" || r.status === "over";
            const canEnd = r.status === "accepted" || r.status === "over";
            const showRate = r.status === "over" || r.status === "ended";
            return (
              <div
                className={`rounded-xl border px-3 py-2 flex flex-col gap-2 transition ${
                  isActive ? "ring-2 ring-primary border-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {p?.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                        {(name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium truncate">{name}</span>
                  </div>
                  {statusBadge(r.status)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canChat && (
                    <Button variant="ghost" size="sm" onClick={() => onOpenChat(r.id)}>
                      <MessageSquare className="w-4 h-4 mr-1" /> Chat
                    </Button>
                  )}
                  {canEnd && (
                    <Button variant="outline" size="sm" onClick={() => onEnd(r.id)}>
                      End
                    </Button>
                  )}
                </div>
                {showRate && (
                  <RatingRow
                    value={r.rating ?? 0}
                    onChange={(v) => onRate(r.id, v)}
                    onDismiss={() => onDismiss(r.id)}
                    disabled={busy}
                  />
                )}
              </div>
            );
          })()
        ) : pending.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => pending.forEach((r) => onCancel(r.id))}
            disabled={busy}
          >
            Cancel request
          </Button>
        ) : null}
      </div>

      {terminalOnly && (
        <button
          type="button"
          onClick={() => group.requests.forEach((r) => onDismiss(r.id))}
          disabled={busy}
          className="absolute bottom-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
          aria-label="Dismiss record"
          title="Remove record"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}



function RatingRow({
  value,
  onChange,
  onDismiss,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  onDismiss?: () => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1 pt-1">
      <span className="text-xs text-muted-foreground mr-1">Rate:</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="p-0.5 disabled:opacity-50"
          aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
        >
          <Star className={`w-5 h-5 ${n <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
        </button>
      ))}
      {value > 0 && <span className="text-xs text-muted-foreground ml-1">{value}/5</span>}
      {onDismiss && (
        <button
          type="button"
          disabled={disabled}
          onClick={onDismiss}
          className="ml-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
          aria-label="Skip rating and dismiss"
          title="Skip rating"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function ChatPanel({
  request,
  currentUserId,
  onClose,
}: {
  request: Req | null;
  currentUserId: string | null;
  onClose: () => void;
}) {
  const getFn = useServerFn(getMessages);
  const sendFn = useServerFn(sendMessage);
  const qc = useQueryClient();
  const requestId = request?.id ?? null;

  const q = useQuery({
    queryKey: ["messages", requestId],
    queryFn: () => getFn({ data: { requestId: requestId! } }),
    enabled: !!requestId,
    refetchInterval: requestId ? 3000 : false,
  });

  const [draft, setDraft] = useState("");
  const send = useMutation({
    mutationFn: (body: string) => sendFn({ data: { requestId: requestId!, body } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["messages", requestId] });
    },
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [q.data?.messages?.length]);

  if (!request) {
    return (
      <div className="rounded-2xl border bg-card p-6 h-full flex flex-col items-center justify-center text-center">
        <MessageSquare className="w-8 h-8 text-muted-foreground mb-2" />
        <p className="font-medium">Chat</p>
        <p className="text-sm text-muted-foreground mt-1">
          Select an accepted request on the left to start chatting.
        </p>
      </div>
    );
  }

  const viewingAsHelper = request.helper_user_id === currentUserId;
  const otherUser = viewingAsHelper ? request.mentee_user_profile : request.helper_user_profile;
  const fallbackName =
    (viewingAsHelper
      ? (request.mentee_profile as any)?.name ?? (request.mentee_profile as any)?.full_name
      : (request.helper_profile as any)?.name ?? (request.helper_profile as any)?.full_name) ??
    "Unknown user";
  const name = otherUser?.display_name?.trim() || fallbackName;
  const avatar = otherUser?.avatar_url as string | undefined;
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const disabled = request.status !== "accepted" && request.status !== "over";

  return (
    <div className="rounded-2xl border bg-card flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {avatar ? (
            <img src={avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
              {initial}
            </div>
          )}
          <p className="font-medium truncate">{name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (q.data?.messages ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No messages yet. Say hi 👋</p>
        ) : (
          (q.data?.messages ?? []).map((m: any) => {
            const mine = m.sender_user_id === currentUserId;
            const name = m.sender_profile?.display_name ?? (mine ? "You" : "User");
            const avatar = m.sender_profile?.avatar_url as string | undefined;
            const initial = (name || "?").trim().charAt(0).toUpperCase();
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && (
                  avatar ? (
                    <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mt-4" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs shrink-0 mt-4">{initial}</div>
                  )
                )}
                <div className={`max-w-[80%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <span className="text-[11px] text-muted-foreground px-1 mb-0.5">{name}</span>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
                {mine && (
                  avatar ? (
                    <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mt-4" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs shrink-0 mt-4">{initial}</div>
                  )
                )}
              </div>
            );
          })
        )}
      </div>

      <form
        className="border-t p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (!v || disabled) return;
          send.mutate(v);
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={disabled ? "Chat is closed" : "Type a message…"}
          disabled={disabled || send.isPending}
          rows={1}
          className="resize-none min-h-[40px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const v = draft.trim();
              if (v && !disabled) send.mutate(v);
            }
          }}
        />
        <Button type="submit" size="icon" disabled={disabled || !draft.trim() || send.isPending}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
