import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell, useBackground } from "@/components/purpose/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, uploadAvatar } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Purpose" },
      { name: "description", content: "Your Purpose profile." },
      { property: "og:title", content: "Profile — Purpose" },
      { property: "og:description", content: "Your Purpose profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const [bg] = useBackground();
  const [name, setName] = useState("Guest");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    void getMyProfile().then((p) => {
      if (p) {
        setName(p.username);
        setAvatar(p.avatar_url ?? null);
        if (p.avatar_url) {
          try {
            localStorage.setItem("purpose-my-avatar", p.avatar_url);
            window.dispatchEvent(new Event("purpose-avatar-updated"));
          } catch {}
        }
      }
    });
  }, []);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      const url = await uploadAvatar(f);
      setAvatar(url);
      try {
        localStorage.setItem("purpose-my-avatar", url);
        window.dispatchEvent(new Event("purpose-avatar-updated"));
      } catch {}
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    try {
      localStorage.removeItem("purpose-my-avatar");
      window.dispatchEvent(new Event("purpose-avatar-updated"));
    } catch {}
    await supabase.auth.signOut();
    nav({ to: "/signin", replace: true });
  }

  return (
    <AppShell
      bg={bg}
      header={
        <h1 className="mx-auto max-w-2xl px-4 py-3.5 text-lg font-bold tracking-tight text-foreground">
          Profile
        </h1>
      }
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-12">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Change profile photo"
          className="group relative transition-transform active:scale-95"
        >
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className="h-32 w-32 rounded-full object-cover ring-4 ring-primary/25 shadow-xl transition-all group-hover:ring-primary/40"
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-primary text-5xl font-bold text-primary-foreground ring-4 ring-primary/25 shadow-xl transition-all group-hover:ring-primary/40">
              {name[0]?.toUpperCase()}
            </div>
          )}
          <span className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-background text-primary ring-2 ring-border shadow-md transition-transform group-hover:scale-110">
            <Camera className="h-4 w-4" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {busy && <p className="mt-2 text-sm text-muted-foreground animate-pulse">Uploading…</p>}
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        <p className="mt-4 text-xl font-bold tracking-tight text-foreground">{name}</p>
        <button
          onClick={signOut}
          className="mt-8 rounded-xl border border-border/80 bg-background/60 backdrop-blur-md px-6 py-2.5 text-sm font-semibold text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all shadow-xs active:scale-95"
        >
          Sign out
        </button>
      </div>
    </AppShell>
  );
}