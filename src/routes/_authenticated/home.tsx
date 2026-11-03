import { createFileRoute } from "@tanstack/react-router";
import { Palette, Search } from "lucide-react";
import { useState } from "react";
import { AppShell, useBackground } from "@/components/purpose/AppShell";
import { Logo } from "@/components/purpose/Logo";
import { BACKGROUNDS, CONTACTS } from "@/lib/purpose";
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
  const list = CONTACTS.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

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
      <ul className="mx-auto max-w-2xl divide-y divide-border/60 px-2 py-2">
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-foreground/5">
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                {c.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <span className={cn("absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full ring-2 ring-background animate-pulse", c.online ? "bg-online" : "bg-offline")}
                aria-label={c.online ? "Online" : "Offline"} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-semibold text-foreground">{c.name}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{c.time}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm text-muted-foreground">{c.last}</p>
                {c.unread > 0 && <span className="rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">{c.unread}</span>}
              </div>
            </div>
          </li>
        ))}
        {list.length === 0 && <li className="py-10 text-center text-sm text-muted-foreground">No chats found</li>}
      </ul>
    </AppShell>
  );
}
