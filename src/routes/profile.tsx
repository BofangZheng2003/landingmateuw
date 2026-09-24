import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "sonner";

import {
  getMyHelperProfile,
  updateHelperText,
  createHelperProfile,
  quitHelper,
} from "@/lib/helper-match.functions";
import { Users, Sparkles } from "lucide-react";


export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile" }] }),
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [academicLevel, setAcademicLevel] = useState<"undergrad" | "grad" | "">("");
  const [age, setAge] = useState("");
  const [major, setMajor] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [interest, setInterest] = useState("");
  const [saving, setSaving] = useState(false);
  const [helperId, setHelperId] = useState<string | null>(null);
  const [canHelpWith, setCanHelpWith] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [availability, setAvailability] = useState("");
  const [savingActive, setSavingActive] = useState(false);
  const [savingHelper, setSavingHelper] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  const [registering, setRegistering] = useState(false);
  const [newHelperText, setNewHelperText] = useState("");
  const [newAvailability, setNewAvailability] = useState("");

  const getHelperFn = useServerFn(getMyHelperProfile);
  const updateHelpFn = useServerFn(updateHelperText);
  const createHelperFn = useServerFn(createHelperProfile);
  const quitHelperFn = useServerFn(quitHelper);


  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      setUser(data.user);
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, academic_level, age, major, country, language, interest")
        .eq("id", data.user.id)
        .maybeSingle();
      const p: any = prof ?? {};
      setDisplayName(p.display_name ?? "");
      setAvatarUrl(p.avatar_url ?? "");
      setAcademicLevel((p.academic_level as "undergrad" | "grad" | null) ?? "");
      setAge(p.age != null ? String(p.age) : "");
      setMajor(p.major ?? "");
      setCountry(p.country ?? "");
      setLanguage(p.language ?? "");
      setInterest(p.interest ?? "");
      try {
        const mp = await getHelperFn();
        if (mp) {
          setHelperId(mp.id);
          setCanHelpWith(mp.can_help_with ?? "");
          setIsActive((mp as any).is_active ?? true);
          setAvailability((mp as any).availability ?? "");
        }
      } catch {
        // ignore
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/auth" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleUpload(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB.");
      return;
    }
    setSaving(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setSaving(false);
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const newUrl = pub.publicUrl;
    setAvatarUrl(newUrl);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, avatar_url: newUrl }, { onConflict: "id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Avatar updated");
  }

  async function handleSave() {
    if (!user) return;
    const ageNum = age ? Number(age) : null;
    if (ageNum !== null && (!Number.isInteger(ageNum) || ageNum < 16 || ageNum > 100)) {
      toast.error("Age must be a whole number between 16 and 100.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: displayName.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          academic_level: academicLevel || null,
          age: ageNum,
          major: major.trim() || null,
          country: country.trim() || null,
          language: language.trim() || null,
          interest: interest.trim() || null,
        } as any,
        { onConflict: "id" },
      );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile updated");
  }

  async function handleSaveHelper() {
    if (!helperId) return;
    if (canHelpWith.trim().length < 10) {
      toast.error("Helper description must be at least 10 characters.");
      return;
    }
    if (availability.trim().length < 3) {
      toast.error("Availability is required (at least 3 characters).");
      return;
    }
    setSavingHelper(true);
    try {
      await updateHelpFn({ data: { canHelpWith: canHelpWith.trim(), isActive, availability: availability.trim() } });
      toast.success("Helper info saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save helper info.");
    } finally {
      setSavingHelper(false);
    }
  }

  async function handleQuitHelper() {
    if (!helperId) return;
    setConfirmQuit(false);
    setQuitting(true);
    try {
      await quitHelperFn();
      setHelperId(null);
      setCanHelpWith("");
      setAvailability("");
      setIsActive(true);
      setNewHelperText("");
      toast.success("You are no longer a Helper.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not quit helper.");
    } finally {
      setQuitting(false);
    }
  }



  async function handleActiveToggle() {
    if (!helperId) return;
    if (canHelpWith.trim().length < 10) {
      toast.error("Helper description must be at least 10 characters.");
      return;
    }
    const next = !isActive;
    if (next && availability.trim().length < 3) {
      toast.error("Please add your availability before activating.");
      return;
    }
    setIsActive(next);
    setSavingActive(true);
    try {
      await updateHelpFn({ data: { canHelpWith: canHelpWith.trim(), isActive: next, availability: availability.trim() } });
      toast.success(next ? "Helper activated" : "Helper inactive");
    } catch (e: any) {
      setIsActive(!next);
      toast.error(e?.message ?? "Could not update helper status.");
    } finally {
      setSavingActive(false);
    }
  }

  async function handleRegisterHelper() {
    if (newHelperText.trim().length < 10) {
      toast.error("Please describe what you can help with (at least 10 characters).");
      return;
    }
    if (newAvailability.trim().length < 3) {
      toast.error("Availability is required (at least 3 characters).");
      return;
    }
    setRegistering(true);
    try {
      const res: any = await createHelperFn({
        data: { canHelpWith: newHelperText.trim(), availability: newAvailability.trim() },
      });
      const newId = res?.profile?.id ?? null;
      if (newId) {
        setHelperId(newId);
        setCanHelpWith(newHelperText.trim());
        setAvailability(newAvailability.trim());
        setNewHelperText("");
        setNewAvailability("");
        // Newly registered helpers default to active on the server side; reflect that.
        setIsActive(true);
        toast.success("You are now a Helper!");
      }
    } catch (e: any) {
      const msg = e?.message?.includes("PROFILE_INCOMPLETE")
        ? "Please complete your basic profile fields first (academic level, age, major, country, language, interest)."
        : e?.message ?? "Could not register as a helper.";
      toast.error(msg);
    } finally {
      setRegistering(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  const initial = (displayName || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-10 max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
          {/* LEFT: basic info */}
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <div className="flex items-center gap-4">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Avatar preview"
                    className="w-16 h-16 rounded-full object-cover border"
                    onError={(e) => ((e.currentTarget.style.display = "none"))}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-medium">
                    {initial}
                  </div>
                )}
                <div>
                  <p className="text-base font-medium text-foreground">{displayName || "(no display name)"}</p>
                  <p className="text-muted-foreground">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">This name & avatar appear on your chat messages.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dn">Display name</Label>
                <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="av">Avatar</Label>
                <Input
                  id="av"
                  type="file"
                  accept="image/*"
                  disabled={saving}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <p className="text-xs text-muted-foreground">Upload an image (max 5MB). Leave empty to use initials.</p>
                {avatarUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setAvatarUrl("")} disabled={saving}>
                    Remove avatar
                  </Button>
                )}
              </div>

              <div className="pt-2 border-t space-y-4">
                <div>
                  <p className="text-sm font-medium">Helper / Helpee details</p>
                  <p className="text-xs text-muted-foreground">Required before you can request or offer help.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="al">Academic level</Label>
                    <select
                      id="al"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={academicLevel}
                      onChange={(e) => setAcademicLevel(e.target.value as "undergrad" | "grad" | "")}
                    >
                      <option value="">Select…</option>
                      <option value="undergrad">Undergrad</option>
                      <option value="grad">Grad</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ag">Age</Label>
                    <Input id="ag" type="number" min={16} max={100} value={age} onChange={(e) => setAge(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mj">Major</Label>
                    <Input id="mj" value={major} onChange={(e) => setMajor(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="co">Country</Label>
                    <Input id="co" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. United States" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lg">Language(s)</Label>
                    <Input id="lg" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="e.g. English, Mandarin" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="in">Interests</Label>
                    <Input id="in" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="e.g. AI, hiking, music" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                <Button variant="outline" onClick={handleSignOut}>Sign out</Button>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT: helper card (sticky, styled like Home right card) */}
          <div className="lg:sticky lg:top-6">
            <div
              style={{
                ["--primary" as any]: "oklch(0.68 0.16 42)",
                ["--primary-foreground" as any]: "oklch(0.99 0.01 80)",
                ["--accent" as any]: "oklch(0.88 0.06 55)",
                fontFamily: '"Outfit", ui-sans-serif, system-ui, sans-serif',
              }}
              className="relative"
            >
              <div className="absolute inset-0 bg-primary/10 rounded-[2.5rem] -rotate-2 scale-[1.02] -z-10" />
              <div className="bg-card border border-border shadow-xl rounded-[2rem] p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/40 rounded-full blur-3xl -mr-8 -mt-8" />
                <div className="absolute bottom-0 left-0 w-28 h-28 bg-primary/15 rounded-full blur-3xl -ml-14 -mb-14" />

                <div className="relative z-10 space-y-4 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <div style={{ fontFamily: '"Lora", ui-serif, Georgia, serif' }} className="text-xl leading-none">
                        Helper
                      </div>
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em] mt-1">
                        Your listing
                      </div>
                    </div>
                  </div>

                  {helperId ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-sm font-medium">You are</span>
                        <Button
                          type="button"
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          disabled={savingActive}
                          onClick={handleActiveToggle}
                          className="rounded-full"
                        >
                          {savingActive ? "Updating…" : isActive ? "Active" : "Inactive"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isActive
                          ? "You are visible to helpees and can receive requests."
                          : "You are hidden from helpee searches."}
                      </p>

                      <div className="space-y-2">
                        <Label htmlFor="av-time">Availability</Label>
                        <Textarea
                          id="av-time"
                          rows={2}
                          value={availability}
                          onChange={(e) => setAvailability(e.target.value)}
                          placeholder="e.g. Weekday evenings 7–10pm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="help-desc">Helper description</Label>
                        <Textarea
                          id="help-desc"
                          rows={4}
                          value={canHelpWith}
                          onChange={(e) => setCanHelpWith(e.target.value)}
                          placeholder="What can you help with?"
                        />
                      </div>

                      <div className="flex flex-col gap-2 pt-1">
                        <Button
                          onClick={handleSaveHelper}
                          disabled={savingHelper || quitting}
                          className="w-full rounded-full"
                        >
                          {savingHelper ? "Saving…" : "Save helper info"}
                        </Button>
                        <Button
                          onClick={() => setConfirmQuit(true)}
                          disabled={quitting || savingHelper}
                          variant="ghost"
                          className="w-full rounded-full bg-background hover:bg-background/80 text-foreground border border-border"
                        >
                          {quitting ? "Quitting…" : "Quit"}
                        </Button>

                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-sm font-medium">You are</span>
                        <span className="inline-flex items-center rounded-full border bg-background px-3 h-8 text-xs text-muted-foreground">
                          <Sparkles className="w-3 h-3 mr-1.5" />
                          Not a Helper
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Fill in what you can help with to register as a Helper. Make sure your basic profile fields are complete first.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="new-av">Availability</Label>
                        <Textarea
                          id="new-av"
                          rows={2}
                          value={newAvailability}
                          onChange={(e) => setNewAvailability(e.target.value)}
                          placeholder="e.g. Weekday evenings 7–10pm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-help">What can you help with?</Label>
                        <Textarea
                          id="new-help"
                          rows={5}
                          value={newHelperText}
                          onChange={(e) => setNewHelperText(e.target.value)}
                          placeholder="At least 10 characters"
                        />
                      </div>
                      <Button
                        onClick={handleRegisterHelper}
                        disabled={registering}
                        className="w-full rounded-full"
                      >
                        {registering ? "Registering…" : "Become a Helper"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      <AlertDialog open={confirmQuit} onOpenChange={setConfirmQuit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quit as a Helper?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all of your helper listings and any pending
              requests sent to you. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleQuitHelper}>Quit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

}
