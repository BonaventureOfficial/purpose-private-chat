import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Lock, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MESSAGE_MAX, getProfile, loadThread, markRead, myId, sendMessage, type Message, type PublicProfile } from "@/lib/chat";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat/$userId")({
  head: () => ({
    meta: [
      { title: "Chat — Purpose" },
      { name: "description", content: "A private Purpose conversation." },
      { property: "og:title", content: "Chat — Purpose" },
      { property: "og:description", content: "A private Purpose conversation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChatPage() {
  const { userId } = Route.useParams();
  const [me, setMe] = useState<string | null>(null);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const id = await myId();
      if (!active || !id) return;
      setMe(id);
      setOther(await getProfile(userId));
      setMsgs(await loadThread(id, userId));
      void markRead(id, userId);
    })();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel(`chat-${me}-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${me}` },
        (payload) => {
          const m = payload.new as Message;
          if (m.sender_id !== userId) return;
          setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          void markRead(me, userId);
        })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [me, userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  async function send() {
    if (!me || !text.trim() || sending) return;
    setSending(true); setErr(null);
    try {
      const m = await sendMessage(me, userId, text);
      setMsgs((prev) => [...prev, m]);
      setText("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  }

  const name = other?.username ?? "…";

  return (
    <div className="flex h-dvh flex-col bg-secondary/40">
      <header className="shrink-0 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-2.5">
          <Link to="/home" aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full text-primary hover:bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {other?.avatar_url ? (
            <img src={other.avatar_url} alt={name} className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{name[0]?.toUpperCase()}</div>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{name}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Private conversation</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-1.5 px-3 py-4">
          {msgs.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Say hello to {name} 👋</p>
          )}
          {msgs.map((m) => {
            const mine = m.sender_id === me;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] shadow-sm",
                  mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-background text-foreground ring-1 ring-border",
                )}>
                  {m.body}
                  <span className={cn("ml-2 inline-block translate-y-0.5 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {time(m.created_at)}{mine && (m.read_at ? " ✓✓" : " ✓")}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-3 py-3">
          {err && <p className="mb-2 text-xs text-destructive">{err}</p>}
          <div className="flex items-end gap-2 rounded-2xl border-2 border-primary/30 bg-background p-1.5 shadow-sm transition focus-within:border-primary">
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              placeholder="Write a message…"
              aria-label="Message"
              className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={() => void send()}
              disabled={!text.trim() || sending}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              <SendHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
