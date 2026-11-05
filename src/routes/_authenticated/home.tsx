import { Link, createFileRoute } from "@tanstack/react-router";
import { Palette, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, useBackground } from "@/components/purpose/AppShell";
import { Logo } from "@/components/purpose/Logo";
import { supabase } from "@/integrations/supabase/client";
import { BACKGROUNDS } from "@/lib/purpose";
import { listConversations, myId, searchPeople, type Conversation, type PublicProfile } from "@/lib/chat";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Chats — Purpose" },
      { name: "description", content: "Your private Purpose conversations." },
      { property: "og:title", content: "Chats — Purpose" },
      { property: "og:description", content: "Your private Purpose conversations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

function Avatar({ p }: { p: PublicProfile }) {
  return (
    <div className="relative shrink-0">
      {p.avatar_url ? (
        <img src={p.avatar_url} alt={p.username} className="h-16 w-16 rounded-full object-cover" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
          {p.username[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

function HomePage() {
  const [bg, setBg] = useBackground();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [convos, setConvos] = useState<Conversation[] | null>(null);
  const [people, setPeople] = useState<PublicProfile[]>([]);

  useEffect(() => {
    void myId().then(async (id) => {
      setMe(id);
      if (id) setConvos(await listConversations(id));
    });
  }, []);

  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel(`inbox-${me}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${me}` },
        () => { void listConversations(me).then(setConvos); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [me]);

  useEffect(() => {
    const t = setTimeout(() => { void searchPeople(q).then(setPeople).catch(() => setPeople([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = (convos ?? []).filter((c) => c.partner.username.toLowerCase().includes(q.trim().toLowerCase()));
  const known = new Set(filtered.map((c) => c.partner.id));
  const newPeople = people.filter((p) => !known.has(p.id));

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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats or find people by user name"
          className="w-full rounded-full border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>
    </div>
  );

  return (
    <AppShell header={header} bg={bg}>
      <ul className="mx-auto max-w-2xl px-2 py-2">
        {filtered.map((c) => (
          <li key={c.partner.id}>
            <Link to="/chat/$userId" params={{ userId: c.partner.id }}
              className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-foreground/5">
              <Avatar p={c.partner} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-foreground">{c.partner.username}</p>
                <p className={cn("truncate text-sm", c.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {c.last.deleted_at ? <em>Message deleted</em> : <>{c.last.sender_id === me ? "You: " : ""}{c.last.body}</>}
                </p>
              </div>
              {c.unread > 0 && (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{c.unread}</span>
              )}
            </Link>
          </li>
        ))}
        {newPeople.length > 0 && (
          <li className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</li>
        )}
        {newPeople.map((p) => (
          <li key={p.id}>
            <Link to="/chat/$userId" params={{ userId: p.id }}
              className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-foreground/5">
              <Avatar p={p} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-foreground">{p.username}</p>
                <p className="truncate text-sm text-muted-foreground">Start a conversation</p>
              </div>
            </Link>
          </li>
        ))}
        {convos && filtered.length === 0 && newPeople.length === 0 && (
          <li className="py-10 text-center text-sm text-muted-foreground">
            {q.trim() ? "No one found" : "No chats yet. Search a user name above to start chatting."}
          </li>
        )}
      </ul>
    </AppShell>
  );
}
