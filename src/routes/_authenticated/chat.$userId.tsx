import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, CornerUpLeft, Lock, MoreVertical, Pencil, SendHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Fragment, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MESSAGE_MAX, dateLabel, deleteMessage, editMessage, getProfile, isHiddenFor, loadThread, markRead, myId, sendMessage, type Message, type PublicProfile } from "@/lib/chat";
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

/** Delivery ticks: dark red single check while sending, white double check when delivered, dark green double check when read. */
function Ticks({ sending, read }: { sending: boolean; read: boolean }) {
  if (sending) return <Check className="h-3.5 w-3.5 text-destructive" aria-label="Sending" />;
  const color = read ? "text-online" : "text-primary-foreground";
  return (
    <span className="inline-flex items-center" aria-label={read ? "Read" : "Delivered"}>
      <Check className={cn("h-3.5 w-3.5", color)} />
      <Check className={cn("-ml-2.5 h-3.5 w-3.5", color)} />
    </span>
  );
}

function ChatPage() {
  const { userId } = Route.useParams();
  const [me, setMe] = useState<string | null>(null);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Message[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `recipient_id=eq.${me}` },
        (payload) => {
          const m = payload.new as Message;
          if (m.sender_id !== userId) return;
          setMsgs((prev) => isHiddenFor(m, me) ? prev.filter((x) => x.id !== m.id) : prev.map((x) => (x.id === m.id ? m : x)));
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `sender_id=eq.${me}` },
        (payload) => {
          const m = payload.new as Message;
          if (m.recipient_id !== userId) return;
          setMsgs((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [me, userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, pending.length]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  async function send() {
    if (!me || !text.trim() || sending) return;
    const body = text;
    if (editing) {
      const target = editing;
      setSending(true); setErr(null);
      try {
        await editMessage(target.id, body);
        setMsgs((prev) => prev.map((x) => (x.id === target.id ? { ...x, body: body.trim(), edited_at: new Date().toISOString() } : x)));
        setEditing(null); setText("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not edit.");
      } finally { setSending(false); taRef.current?.focus(); }
      return;
    }
    const reply = replyTo;
    const optimistic: Message = {
      id: `pending-${Date.now()}`,
      sender_id: me,
      recipient_id: userId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      edited_at: null,
      deleted_at: null,
      recipient_hidden: false,
      reply_to_id: reply?.id ?? null,
    };
    setSending(true); setErr(null);
    setPending((p) => [...p, optimistic]);
    setText(""); setReplyTo(null);
    try {
      const m = await sendMessage(me, userId, body, reply?.id ?? null);
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setPending((p) => p.filter((x) => x.id !== optimistic.id));
    } catch (e) {
      setPending((p) => p.filter((x) => x.id !== optimistic.id));
      setText(body); setReplyTo(reply);
      setErr(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  }

  async function onDelete(m: Message) {
    if (!me) return;
    try {
      await deleteMessage(m, me);
      setMsgs((prev) => m.sender_id === me
        ? prev.map((x) => (x.id === m.id ? { ...x, body: "", deleted_at: new Date().toISOString() } : x))
        : prev.filter((x) => x.id !== m.id));
      if (editing?.id === m.id) { setEditing(null); setText(""); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete."); }
  }

  async function onCopy(m: Message) {
    try { await navigator.clipboard.writeText(m.body); toast.success("Copied"); }
    catch { toast.error("Could not copy."); }
  }

  const name = other?.username ?? "…";
  const display = [...msgs, ...pending];

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
          {display.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Say hello to {name} 👋</p>
          )}
          {display.map((m, i) => {
            const mine = m.sender_id === me;
            const label = dateLabel(m.created_at);
            const prevLabel = i > 0 ? dateLabel(display[i - 1]!.created_at) : null;
            const isPending = m.id.startsWith("pending-");
            return (
              <Fragment key={m.id}>
                {label !== prevLabel && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-background px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
                      {label}
                    </span>
                  </div>
                )}
                <div className={cn("group flex items-start gap-1", mine ? "flex-row-reverse" : "flex-row")}>
                  <div className={cn(
                    "max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] shadow-sm",
                    mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-background text-foreground ring-1 ring-border",
                  )}>
                    {m.reply_to_id && (() => {
                      const q = display.find((x) => x.id === m.reply_to_id);
                      return (
                        <span className={cn("mb-1 block rounded-lg border-l-4 px-2 py-1 text-xs", mine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary bg-secondary")}>
                          <span className="block font-semibold">{q ? (q.sender_id === me ? "You" : name) : ""}</span>
                          <span className="line-clamp-2 opacity-80">{!q || q.deleted_at ? "Message deleted" : q.body}</span>
                        </span>
                      );
                    })()}
                    {m.deleted_at ? <em className="opacity-70">Message deleted</em> : m.body}
                    {m.edited_at && !m.deleted_at && <span className="ml-1 text-[10px] opacity-70">(edited)</span>}
                    <span className={cn("ml-2 inline-flex translate-y-0.5 items-center gap-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {time(m.created_at)}
                      {mine && <Ticks sending={isPending} read={!isPending && !!m.read_at} />}
                    </span>
                  </div>
                  {!isPending && !m.deleted_at && (
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label="Message options" className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-60 transition hover:bg-background hover:opacity-100 focus:opacity-100 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={mine ? "end" : "start"} className="w-40">
                        {mine && (
                          <>
                            <DropdownMenuItem onSelect={() => { setReplyTo(null); setEditing(m); setText(m.body); setTimeout(() => taRef.current?.focus(), 0); }}>
                              <Pencil className="h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => { setEditing(null); setReplyTo(m); setTimeout(() => taRef.current?.focus(), 0); }}>
                              <CornerUpLeft className="h-4 w-4" /> Reply
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem onSelect={() => void onCopy(m)}>
                          <Copy className="h-4 w-4" /> Copy
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void onDelete(m)} className="text-destructive focus:text-destructive">
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </Fragment>
            );
          })}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-3 py-3">
          {err && <p className="mb-2 text-xs text-destructive">{err}</p>}
          {(editing || replyTo) && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-primary bg-secondary px-3 py-1.5 text-xs">
              {editing ? <Pencil className="h-3.5 w-3.5 text-primary" /> : <CornerUpLeft className="h-3.5 w-3.5 text-primary" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-primary">{editing ? "Editing message" : "Replying to yourself"}</p>
                <p className="truncate text-muted-foreground">{(editing ?? replyTo)!.body}</p>
              </div>
              <button aria-label="Cancel" onClick={() => { if (editing) setText(""); setEditing(null); setReplyTo(null); }} className="rounded-full p-1 hover:bg-background">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border-2 border-primary/30 bg-background p-1.5 shadow-sm transition focus-within:border-primary">
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && (editing || replyTo)) { if (editing) setText(""); setEditing(null); setReplyTo(null); }
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
