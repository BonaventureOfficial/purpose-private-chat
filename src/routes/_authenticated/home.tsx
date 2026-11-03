import { createFileRoute } from "@tanstack/react-router";
import { Palette, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, useBackground } from "@/components/purpose/AppShell";
import { Logo } from "@/components/purpose/Logo";
import { supabase } from "@/integrations/supabase/client";
import { BACKGROUNDS } from "@/lib/purpose";
import { getMyProfile } from "@/lib/media";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Chats — Purpose" },
      { name: "description", content: "Your private Purpose conversations." },
      { property: "og:title", content: "Chats — Purpose" },
      { property: "og:description", content: "Your private Purpose conversations." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [bg, setBg] = useBackground();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [me, setMe] = useState<string | null>(null);

  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then((res) => {
      const user = res.data.user;
      const meta = user?.user_metadata as { username?: string } | undefined;
      setMe(meta?.username ?? user?.email?.split("@")[0] ?? null);
    });
    void getMyProfile().then((p) => setAvatar(p?.avatar_url ?? null));
  }, []);

  const visible = me && me.toLowerCase().includes(q.toLowerCase());

  const header = (
    <div className="mx-auto max-w-2xl px-4 pb-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="h-9 w-9" />
          <span className="text-lg font-bold text-foreground">Purpose</span>
        </div>
        <div className="relative">
          <button onClick={() => setOpen(!open)} aria-label="Background color"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary hover:opacity-80">
            <Palette className="h-5 w-5" />
          </button>
          {open && (
            <div className="absolute right-0 top-12 z-20 grid w-56 grid-cols-5 gap-2 rounded-2xl bg-popover p-3 shadow-[var(--shadow-soft)] ring-1 ring-border">
              {BACKGROUNDS.map((b) => (
                <button key={b.name} title={b.name} onClick={() => { setBg(b.value); setOpen(false); }}
                  className={cn("h-8 w-8 rounded-full ring-1 ring-border", bg === b.value && "ring-2 ring-primary")}
                  style={{ backgroundColor: b.value }} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats"
          className="w-full rounded-full border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>
    </div>
  );

  return (
    <AppShell header={header} bg={bg}>
      <ul className="mx-auto max-w-2xl px-2 py-2">
        {visible && (
          <li className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-foreground/5">
            <div className="relative">
              {avatar ? (
                <img src={avatar} alt={me!} className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
                  {me![0]?.toUpperCase()}
                </div>
              )}
              <span className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full bg-online ring-2 ring-background animate-pulse" aria-label="Online" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground">{me} (You)</p>
              <p className="truncate text-sm text-muted-foreground">Your account</p>
            </div>
          </li>
        )}
        {me && !visible && <li className="py-10 text-center text-sm text-muted-foreground">No chats found</li>}
      </ul>
    </AppShell>
  );
}
