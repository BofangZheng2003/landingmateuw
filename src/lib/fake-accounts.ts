// Client-safe fake account definitions and login helper.
// Does NOT use the service role key — signs in via public auth, signs up on first use.
import { supabase } from "@/integrations/supabase/client";

export const FAKE_PASSWORD = "FakePass123!";

export type FakeProfile = {
  email: string;
  display_name: string;
  academic_level: "undergrad" | "grad";
  age: number;
  major: string;
  country: string;
  language: string;
  interest: string;
  bio: string;
};

export const FAKE_ACCOUNTS: FakeProfile[] = [
  { email: "alice.fake@landingmate.test", display_name: "Alice Chen", academic_level: "undergrad", age: 20, major: "Computer Science", country: "USA", language: "English, Mandarin", interest: "AI, hiking", bio: "CS sophomore, loves open source." },
  { email: "bob.fake@landingmate.test", display_name: "Bob Martinez", academic_level: "grad", age: 25, major: "Mechanical Engineering", country: "Mexico", language: "Spanish, English", interest: "Robotics, cycling", bio: "PhD candidate working on drones." },
  { email: "carol.fake@landingmate.test", display_name: "Carol Nguyen", academic_level: "undergrad", age: 19, major: "Biology", country: "Vietnam", language: "Vietnamese, English", interest: "Genetics, painting", bio: "Pre-med, aspiring researcher." },
  { email: "david.fake@landingmate.test", display_name: "David Kim", academic_level: "grad", age: 27, major: "Economics", country: "South Korea", language: "Korean, English", interest: "Finance, chess", bio: "Masters in econ, ex-analyst." },
  { email: "emma.fake@landingmate.test", display_name: "Emma Johnson", academic_level: "undergrad", age: 21, major: "Psychology", country: "UK", language: "English", interest: "Behavioral science, yoga", bio: "Final-year psych student." },
  { email: "frank.fake@landingmate.test", display_name: "Frank Weber", academic_level: "grad", age: 29, major: "Physics", country: "Germany", language: "German, English", interest: "Quantum computing, running", bio: "PhD in quantum optics." },
  { email: "grace.fake@landingmate.test", display_name: "Grace Patel", academic_level: "undergrad", age: 20, major: "Business", country: "India", language: "Hindi, English", interest: "Startups, dance", bio: "Business major, love pitching ideas." },
  { email: "henry.fake@landingmate.test", display_name: "Henry Dubois", academic_level: "grad", age: 26, major: "Chemistry", country: "France", language: "French, English", interest: "Materials science, cooking", bio: "PhD in materials chemistry." },
  { email: "ivy.fake@landingmate.test", display_name: "Ivy Yamada", academic_level: "undergrad", age: 22, major: "Design", country: "Japan", language: "Japanese, English", interest: "UI/UX, photography", bio: "Design senior building a portfolio." },
  { email: "jack.fake@landingmate.test", display_name: "Jack O'Connor", academic_level: "grad", age: 28, major: "Law", country: "Ireland", language: "English", interest: "Policy, football", bio: "Law student focused on tech policy." },
];

export async function loginAsFakeAccount(index: number): Promise<void> {
  const profile = FAKE_ACCOUNTS[index];
  if (!profile) throw new Error("Unknown fake account");

  // Try sign-in first.
  let { error } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: FAKE_PASSWORD,
  });

  // If the account doesn't exist yet, sign up (auto-confirm is enabled) then sign in.
  if (error) {
    const { error: signUpError } = await supabase.auth.signUp({
      email: profile.email,
      password: FAKE_PASSWORD,
      options: { data: { display_name: profile.display_name } },
    });
    if (signUpError && !/registered/i.test(signUpError.message)) {
      throw new Error(signUpError.message);
    }
    const retry = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: FAKE_PASSWORD,
    });
    if (retry.error) throw new Error(retry.error.message);
  }

  // Upsert profile fields as the signed-in user (RLS allows own row).
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (uid) {
    await supabase.from("profiles").upsert({
      id: uid,
      display_name: profile.display_name,
      academic_level: profile.academic_level,
      age: profile.age,
      major: profile.major,
      country: profile.country,
      language: profile.language,
      interest: profile.interest,
      bio: profile.bio,
    });
  }
}
