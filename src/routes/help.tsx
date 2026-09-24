import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, type CSSProperties } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BookOpen, GraduationCap, Sparkles, Users, ChevronRight, Check, Star, MessageSquare } from "lucide-react";
import {
  createHelperProfile,
  createMenteeProfile,
  getProfileStats,
  getMyHelperProfile,
} from "@/lib/helper-match.functions";
import { requestHelp } from "@/lib/help-requests.functions";
import { toast } from "sonner";


export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Look for Help" },
      { name: "description", content: "Find a Helper or offer to help in your university network." },
      { property: "og:title", content: "Look for Help" },
      { property: "og:description", content: "Find a Helper or offer to help in your university network." },
    ],
  }),
  component: Help,
});

type Level = "undergrad" | "grad";
type Match = {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  academic_level: string;
  age: number;
  major: string;
  can_help_with?: string;
  needs_help_with?: string;
  availability?: string | null;
  avg_rating?: number | null;
  rating_count?: number;
};

type Mode = "choose" | "helper" | "mentee";

// Warm collegiate palette scoped to this route only (does not leak globally).
const bridgeTheme: CSSProperties = {
  // Base
  ["--background" as any]: "oklch(0.982 0.014 80)",
  ["--foreground" as any]: "oklch(0.28 0.05 260)",
  ["--card" as any]: "oklch(0.995 0.008 80)",
  ["--card-foreground" as any]: "oklch(0.28 0.05 260)",
  ["--popover" as any]: "oklch(0.995 0.008 80)",
  ["--popover-foreground" as any]: "oklch(0.28 0.05 260)",
  // Primary: burnt terracotta
  ["--primary" as any]: "oklch(0.68 0.16 42)",
  ["--primary-foreground" as any]: "oklch(0.99 0.01 80)",
  // Secondary: warm cream
  ["--secondary" as any]: "oklch(0.94 0.03 70)",
  ["--secondary-foreground" as any]: "oklch(0.28 0.05 260)",
  // Muted & accent
  ["--muted" as any]: "oklch(0.94 0.02 75)",
  ["--muted-foreground" as any]: "oklch(0.48 0.03 260)",
  ["--accent" as any]: "oklch(0.88 0.06 55)",
  ["--accent-foreground" as any]: "oklch(0.35 0.07 40)",
  // Borders & inputs: warm taupe
  ["--border" as any]: "oklch(0.88 0.02 70)",
  ["--input" as any]: "oklch(0.88 0.02 70)",
  ["--ring" as any]: "oklch(0.68 0.16 42)",
  ["--radius" as any]: "1rem",
  fontFamily: '"Outfit", ui-sans-serif, system-ui, sans-serif',
  backgroundColor: "var(--background)",
  color: "var(--foreground)",
  minHeight: "calc(100vh - 3.5rem)",
};

const serifStyle: CSSProperties = {
  fontFamily: '"Lora", ui-serif, Georgia, serif',
};

function Help() {
  const [mode, setMode] = useState<Mode>("choose");
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);
  const statsFn = useServerFn(getProfileStats);
  const stats = useQuery({
    queryKey: ["profile-stats"],
    queryFn: () => statsFn(),
    enabled: signedIn,
  });
  const myHelperFn = useServerFn(getMyHelperProfile);
  const myHelper = useQuery({
    queryKey: ["my-helper-profile"],
    queryFn: () => myHelperFn(),
    enabled: signedIn,
  });
  const isHelper = !!myHelper.data;
  const isActiveHelper = isHelper && !!(myHelper.data as any)?.is_active;


  // Testing mode: users may register as helper multiple times.


  return (
    <div style={bridgeTheme} className="selection:bg-primary/20">
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-24 w-full">
        <header className="flex items-center justify-between mb-12">
          {mode !== "choose" && (
            <button
              onClick={() => setMode("choose")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          )}
        </header>

        {mode === "choose" && (
          <Landing
            stats={stats.data}
            loading={stats.isLoading}
            onPick={setMode}
            isActiveHelper={isActiveHelper}
          />
        )}

        {mode !== "choose" && !signedIn && (
          <FormShell title="Sign in to continue" icon={<GraduationCap className="w-5 h-5" />}>
            <p className="text-sm text-muted-foreground mb-6">
              You need an account to create a {mode === "helper" ? "Helper" : "mentee"} profile.
            </p>
            <Link to="/auth" className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:opacity-90 transition">
              Sign in
            </Link>
          </FormShell>
        )}
        {mode === "helper" && signedIn && (
          <ProfileGate mode="helper">
            <HelperForm onDone={() => stats.refetch()} />
          </ProfileGate>
        )}
        {mode === "mentee" && signedIn && (
          <ProfileGate mode="mentee">
            <MenteeForm onDone={() => stats.refetch()} />
          </ProfileGate>
        )}
      </div>
    </div>
  );
}

function Landing({
  stats,
  loading,
  onPick,
  isActiveHelper,
}: {
  stats?: { helperCount: number; menteeCount: number; activeHelperCount: number };
  loading: boolean;
  onPick: (m: Mode) => void;
  isActiveHelper: boolean;
}) {
  const activeHelpers = loading ? "…" : (stats?.activeHelperCount ?? 0);

  return (
    <div className="relative min-h-[calc(100vh-8.5rem)] flex items-center justify-center animate-in fade-in duration-700">
      <NetworkBackground />

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 text-center">
        <h1
          style={serifStyle}
          className="text-[clamp(1.75rem,5vw,3.75rem)] font-semibold tracking-tight leading-[1.1] whitespace-nowrap"
        >
          <span className="text-foreground">CONNECT. </span>
          <span className="text-primary">SUPPORT</span>
          <span className="text-foreground">. GROW.</span>
        </h1>

        <h2
          style={serifStyle}
          className="mt-4 text-[clamp(1.125rem,3vw,2.25rem)] font-semibold tracking-tight whitespace-nowrap"
        >
          <span className="text-foreground">A </span>
          <span className="text-primary">PEER-TO-PEER</span>
          <span className="text-foreground"> HELP NETWORK.</span>
        </h2>

        <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
          Match with a Peer. Exchange Help. Build a Community.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={() => onPick("mentee")}
            className="h-14 px-8 rounded-full text-base font-semibold shadow-lg shadow-primary/20 group bg-primary hover:bg-primary/90"
          >
            <MessageSquare className="w-5 h-5 mr-2" />
            I NEED HELP
            <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>

          {isActiveHelper ? (
            <div className="h-14 px-6 rounded-full bg-card/80 border border-border flex items-center text-sm text-primary font-medium shadow-sm">
              <Sparkles className="w-4 h-4 mr-2" />
              You're already helping. Thank you!
            </div>
          ) : (
            <Button
              asChild
              size="lg"
              className="h-14 px-8 rounded-full text-base font-semibold shadow-lg group"
              style={{
                backgroundColor: "oklch(0.42 0.1 42)",
                color: "oklch(0.99 0.01 80)",
              }}
            >
              <Link to="/profile">
                <GraduationCap className="w-5 h-5 mr-2" />
                I WANT TO HELP
                <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          )}
        </div>

        <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 backdrop-blur px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm">
          <Users className="w-4 h-4 text-primary" />
          <span className="tabular-nums text-foreground">{activeHelpers}</span>
          <span className="uppercase tracking-wider">Active Helpers</span>
        </div>
      </div>
    </div>
  );
}

function NetworkBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute top-[12%] left-[18%] w-24 h-24 rounded-full blur-2xl opacity-60"
        style={{ backgroundColor: "oklch(0.68 0.16 42 / 0.35)" }}
      />
      <div
        className="absolute top-[22%] right-[22%] w-20 h-20 rounded-full blur-2xl opacity-50"
        style={{ backgroundColor: "oklch(0.68 0.16 42 / 0.3)" }}
      />
      <div
        className="absolute bottom-[18%] right-[12%] w-28 h-28 rounded-full blur-3xl opacity-55"
        style={{ backgroundColor: "oklch(0.68 0.16 42 / 0.4)" }}
      />
      <div
        className="absolute bottom-[28%] left-[10%] w-16 h-16 rounded-full blur-2xl opacity-40"
        style={{ backgroundColor: "oklch(0.68 0.16 42 / 0.25)" }}
      />
      <div
        className="absolute top-[45%] left-[45%] w-32 h-32 rounded-full blur-3xl opacity-30"
        style={{ backgroundColor: "oklch(0.68 0.16 42 / 0.2)" }}
      />

      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.68 0.16 42 / 0.15)" />
            <stop offset="100%" stopColor="oklch(0.68 0.16 42 / 0.05)" />
          </linearGradient>
        </defs>

        <g stroke="url(#lineGrad)" strokeWidth="1" fill="none">
          <line x1="8%" y1="15%" x2="28%" y2="35%" />
          <line x1="28%" y1="35%" x2="18%" y2="65%" />
          <line x1="18%" y1="65%" x2="42%" y2="78%" />
          <line x1="42%" y1="78%" x2="68%" y2="62%" />
          <line x1="68%" y1="62%" x2="85%" y2="75%" />
          <line x1="68%" y1="62%" x2="78%" y2="32%" />
          <line x1="78%" y1="32%" x2="92%" y2="18%" />
          <line x1="78%" y1="32%" x2="55%" y2="25%" />
          <line x1="55%" y1="25%" x2="35%" y2="15%" />
          <line x1="55%" y1="25%" x2="42%" y2="45%" />
          <line x1="42%" y1="45%" x2="28%" y2="35%" />
          <line x1="42%" y1="45%" x2="68%" y2="62%" />
          <line x1="42%" y1="45%" x2="18%" y2="65%" />
          <line x1="92%" y1="85%" x2="85%" y2="75%" />
          <line x1="8%" y1="88%" x2="18%" y2="65%" />
          <line x1="35%" y1="15%" x2="55%" y2="25%" />
        </g>

        <g fill="oklch(0.68 0.16 42 / 0.35)">
          <circle cx="8%" cy="15%" r="3" />
          <circle cx="28%" cy="35%" r="2.5" />
          <circle cx="18%" cy="65%" r="3.5" />
          <circle cx="42%" cy="78%" r="2.5" />
          <circle cx="68%" cy="62%" r="3" />
          <circle cx="85%" cy="75%" r="2" />
          <circle cx="78%" cy="32%" r="3" />
          <circle cx="92%" cy="18%" r="2" />
          <circle cx="55%" cy="25%" r="2.5" />
          <circle cx="42%" cy="45%" r="2" />
          <circle cx="35%" cy="15%" r="2" />
          <circle cx="8%" cy="88%" r="2.5" />
          <circle cx="92%" cy="85%" r="2" />
        </g>
      </svg>
    </div>
  );
}



function StatTile({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone: "primary" | "accent";
}) {
  return (
    <div className="bg-background rounded-2xl p-6 border border-border/60 shadow-sm flex flex-col gap-2">
      <span
        style={serifStyle}
        className={tone === "primary" ? "text-4xl text-primary" : "text-4xl text-accent-foreground"}
      >
        {value}
      </span>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}

function FormShell({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
          {icon}
        </div>
        <h2 style={serifStyle} className="text-3xl md:text-4xl tracking-tight">
          {title}
        </h2>
      </div>
      <div className="bg-card border border-border shadow-sm rounded-[2rem] p-8 md:p-10">
        {children}
      </div>
    </div>
  );
}

const REQUIRED_PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: "display_name", label: "display name" },
  { key: "academic_level", label: "academic level" },
  { key: "age", label: "age" },
  { key: "major", label: "major" },
  { key: "country", label: "country" },
  { key: "language", label: "language" },
  { key: "interest", label: "interest" },
];

function ProfileGate({ mode, children }: { mode: "helper" | "mentee"; children: React.ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; missing: string[] }>({ loading: true, missing: [] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, academic_level, age, major, country, language, interest")
        .eq("id", auth.user.id)
        .maybeSingle();
      const p: any = prof ?? {};
      const missing = REQUIRED_PROFILE_FIELDS.filter((f) => {
        const v = p[f.key];
        return v === null || v === undefined || v === "";
      }).map((f) => f.label);
      if (!cancelled) setState({ loading: false, missing });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <FormShell title="Loading…" icon={<GraduationCap className="w-5 h-5" />}>
        <p className="text-sm text-muted-foreground">Checking your profile…</p>
      </FormShell>
    );
  }

  if (state.missing.length > 0) {
    return (
      <FormShell title="Complete your profile" icon={<GraduationCap className="w-5 h-5" />}>
        <p className="text-sm text-muted-foreground mb-4">
          Before you can {mode === "helper" ? "offer help" : "request help"}, please fill in these fields on your profile:
        </p>
        <ul className="list-disc pl-6 text-sm mb-6 space-y-1">
          {state.missing.map((m) => (
            <li key={m} className="capitalize">{m}</li>
          ))}
        </ul>
        <Link
          to="/profile"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:opacity-90 transition"
        >
          Go to profile
        </Link>
      </FormShell>
    );
  }

  return <>{children}</>;
}

function HelperForm({ onDone }: { onDone: () => void }) {
  const fn = useServerFn(createHelperProfile);
  const [canHelpWith, setText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (d: { canHelpWith: string }) => fn({ data: d }),
    onSuccess: () => onDone(),
  });

  return (
    <FormShell title="Become a Helper" icon={<GraduationCap className="w-5 h-5" />}>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canHelpWith.trim().length < 10) {
            setFormError("Please describe what you can help with (at least 10 characters).");
            return;
          }
          setFormError(null);
          mut.mutate({ canHelpWith: canHelpWith.trim() });
        }}
      >
        <Field label="What can you help with?" hint="At least 10 characters">
          <Textarea rows={6} value={canHelpWith} onChange={(e) => setText(e.target.value)} required className="rounded-xl resize-none" />
        </Field>

        <Button type="submit" disabled={mut.isPending} size="lg" className="w-full h-14 rounded-2xl text-base shadow-sm">
          {mut.isPending ? "Saving…" : "Save & find matches"}
        </Button>
        {formError && <p className="text-sm text-destructive text-center">{formError}</p>}
        {mut.isError && !formError && (
          <p className="text-sm text-destructive text-center">
            {(mut.error as any)?.message?.includes("PROFILE_INCOMPLETE")
              ? "Please complete your profile first."
              : "Could not save. Please try again."}
          </p>
        )}
      </form>

      {mut.data ? (
        <MatchesGrid
          title="Top mentee matches"
          empty="No mentees have joined yet — you're one of the first! We'll match you as soon as someone signs up."
          items={((mut.data as any).matches as Match[]).map((m) => ({
            ...m,
            subtitle: m.needs_help_with ?? "",
          }))}
          role="helper"
        />
      ) : null}
    </FormShell>
  );
}

function MenteeForm({ onDone }: { onDone: () => void }) {
  const fn = useServerFn(createMenteeProfile);
  const [needsHelpWith, setText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (d: { needsHelpWith: string }) => fn({ data: d }),
    onSuccess: () => onDone(),
  });

  return (
    <FormShell title="Find a Helper" icon={<BookOpen className="w-5 h-5" />}>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (needsHelpWith.trim().length < 10) {
            setFormError("Please describe what you need help with (at least 10 characters).");
            return;
          }
          setFormError(null);
          mut.mutate({ needsHelpWith: needsHelpWith.trim() });
        }}
      >
        <Field label="What do you need help with?" hint="At least 10 characters">
          <Textarea rows={6} value={needsHelpWith} onChange={(e) => setText(e.target.value)} required className="rounded-xl resize-none" />
        </Field>

        <Button type="submit" disabled={mut.isPending} size="lg" className="w-full h-14 rounded-2xl text-base shadow-sm">
          {mut.isPending ? "Saving…" : "Save & find matches"}
        </Button>
        {formError && <p className="text-sm text-destructive text-center">{formError}</p>}
        {mut.isError && !formError && (
          <p className="text-sm text-destructive text-center">
            {(mut.error as any)?.message?.includes("PROFILE_INCOMPLETE")
              ? "Please complete your profile first."
              : "Could not save. Please try again."}
          </p>
        )}
      </form>

      {mut.data ? (
        <HelperMatchesWithRequest
          items={((mut.data as any).matches as Match[]).map((m) => ({
            ...m,
            subtitle: m.can_help_with ?? "",
          }))}
        />
      ) : null}
    </FormShell>
  );
}


function LevelField({
  value,
  onChange,
  idPrefix,
}: {
  value: Level;
  onChange: (v: Level) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Academic Level</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as Level)}
        className="grid grid-cols-2 gap-3"
      >
        {(["undergrad", "grad"] as Level[]).map((lvl) => (
          <label
            key={lvl}
            htmlFor={`${idPrefix}-${lvl}`}
            className={`flex items-center gap-3 cursor-pointer rounded-xl border px-4 py-3 transition-all ${
              value === lvl
                ? "border-primary bg-primary/10 shadow-sm"
                : "border-border hover:border-primary/40"
            }`}
          >
            <RadioGroupItem id={`${idPrefix}-${lvl}`} value={lvl} />
            <span className="capitalize text-sm font-medium">{lvl === "undergrad" ? "Undergrad" : "Grad"}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function MatchesGrid({
  title,
  empty,
  items,
  role,
}: {
  title: string;
  empty: string;
  items: (Match & { subtitle: string })[];
  role: "helper" | "mentee";
}) {
  return (
    <div className="mt-10 pt-8 border-t border-border/70">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 style={serifStyle} className="text-xl">
          {title}
        </h3>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground italic leading-relaxed">
          {empty}
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-4">
          {items.map((m) => (
            <li
              key={m.id}
              className="bg-background border border-border rounded-2xl p-5 flex flex-col gap-2 hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {role === "helper" ? <GraduationCap className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{m.display_name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground">Age {m.age}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {m.academic_level} · {m.major}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {m.subtitle}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HelperMatchesWithRequest({ items }: { items: (Match & { subtitle: string })[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fn = useServerFn(requestHelp);
  const mut = useMutation({
    mutationFn: (ids: string[]) => fn({ data: { helperUserIds: ids } }),
    onSuccess: (res) => {
      const n = res.inserted.length;
      const skipped = (res as any).skipped ?? 0;
      const atCap = (res as any).atCap ?? 0;
      const menteeCapped = (res as any).menteeCapped ?? 0;
      const notes: string[] = [];
      if (skipped) notes.push(`${skipped} already requested`);
      if (atCap) notes.push(`${atCap} at capacity`);
      if (menteeCapped) notes.push(`${menteeCapped} over your 3-request limit`);
      const suffix = notes.length ? ` (${notes.join(", ")})` : "";
      if (n > 0) {
        toast.success(`Sent ${n} help request${n === 1 ? "" : "s"}${suffix}.`);
      } else {
        toast.info(`No requests sent${suffix || "."}`);
      }
      setSelected(new Set());
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send requests."),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      else toast.info("You can select up to 5 Helpers.");
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <div className="mt-10 pt-8 border-t border-border/70">
        <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground italic leading-relaxed">
          No Helpers have joined yet — check back soon, or invite someone who inspires you.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10 pt-8 border-t border-border/70">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 style={serifStyle} className="text-xl">
            Top Helper matches
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{selected.size} / 5 selected</span>
          <Button
            size="sm"
            disabled={selected.size === 0 || mut.isPending}
            onClick={() => mut.mutate(Array.from(selected))}
          >
            {mut.isPending ? "Sending…" : "Request help"}
          </Button>
          <Link to="/match" className="text-xs underline text-muted-foreground hover:text-foreground">
            View my Match
          </Link>
        </div>
      </div>
      <ul className="grid sm:grid-cols-2 gap-4">
        {items.map((m) => {
          const isSel = selected.has(m.id);
          return (
            <li
              key={m.id}
              onClick={() => toggle(m.id)}
              className={`cursor-pointer bg-background border rounded-2xl p-5 flex flex-col gap-2 transition-all ${
                isSel ? "border-primary ring-2 ring-primary/30 shadow-sm" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {isSel ? <Check className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{m.display_name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground">Age {m.age}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {m.academic_level} · {m.major}
                  </p>
                </div>
                {typeof m.avg_rating === "number" ? (
                  <div className="flex items-center gap-1 text-xs text-amber-600 shrink-0" title={`${m.rating_count} rating${m.rating_count === 1 ? "" : "s"}`}>
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-medium">{m.avg_rating.toFixed(1)}</span>
                    <span className="text-muted-foreground">({m.rating_count})</span>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground shrink-0">No ratings</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {m.subtitle}
              </p>
              {m.availability && (
                <p className="text-xs text-foreground/70 mt-1">
                  <span className="font-medium">Available:</span> {m.availability}
                </p>
              )}

            </li>
          );
        })}
      </ul>
    </div>
  );
}
