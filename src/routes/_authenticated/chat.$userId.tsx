import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Camera, Mic, Square, Check, FileText, Loader2, Paperclip, Copy, CornerUpLeft, Lock, MoreVertical, Pencil, SendHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Fragment, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MESSAGE_MAX, dateLabel, deleteMessage, editMessage, getProfile, isHiddenFor, loadThread, markRead, myId, sendMessage, type Message, type PublicProfile } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { uploadMedia, validateFile, type FileKind } from "@/lib/media";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [staged, setStaged] = useState<{ file: File; kind: FileKind; preview: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const cancelRecRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => () => { if (staged) URL.revokeObjectURL(staged.preview); }, [staged]);

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
    if (staged) { await sendStaged(); return; }
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
      attachment_url: null, attachment_type: null, attachment_name: null,
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

  async function stageFile(file: File) {
    try {
      const kind = await validateFile(file);
      setStaged({ file, kind, preview: URL.createObjectURL(file) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "This file cannot be sent.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      if (camRef.current) camRef.current.value = "";
    }
  }

  async function sendStaged() {
    if (!me || !staged || uploading) return;
    setUploading(true); setErr(null);
    try {
      const url = await uploadMedia(staged.file, "media");
      const m = await sendMessage(me, userId, text, replyTo?.id ?? null, { url, type: staged.kind, name: staged.file.name.slice(0, 200) });
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setText(""); setReplyTo(null); setStaged(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the file.");
    } finally { setUploading(false); }
  }

  async function startRecording() {
    if (recording || staged) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 } });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (cancelRecRef.current || !chunks.length) return;
        const type = (rec.mimeType || "audio/webm").split(";")[0]!;
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        void stageFile(new File(chunks, `voice-${Date.now()}.${ext}`, { type }));
      };
      cancelRecRef.current = false;
      recRef.current = rec;
      rec.start();
      setRecSecs(0); setRecording(true);
    } catch {
      toast.error("Microphone access was denied.");
    }
  }

  function stopRecording(cancel = false) {
    cancelRecRef.current = cancel;
    recRef.current?.stop();
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
                    {!m.deleted_at && m.attachment_url && (
                      <span className="mb-1 block">
                        {m.attachment_type === "image" && (
                          <a href={m.attachment_url} target="_blank" rel="noreferrer"><img src={m.attachment_url} alt={m.attachment_name ?? "Image"} className="max-h-72 rounded-xl object-cover" loading="lazy" /></a>
                        )}
                        {m.attachment_type === "video" && (
                          <video src={m.attachment_url} controls preload="metadata" className="max-h-72 rounded-xl" />
                        )}
                        {m.attachment_type === "audio" && (
                          <audio src={m.attachment_url} controls preload="metadata" className="w-64 max-w-full" />
                        )}
                        {m.attachment_type === "pdf" && (
                          <a href={m.attachment_url} target="_blank" rel="noreferrer" className={cn("flex items-center gap-2 rounded-xl px-3 py-2", mine ? "bg-primary-foreground/10" : "bg-secondary")}>
                            <FileText className="h-6 w-6 shrink-0" /><span className="truncate text-sm font-medium">{m.attachment_name ?? "Document.pdf"}</span>
                          </a>
                        )}
                      </span>
                    )}
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
                            {!m.attachment_url && <DropdownMenuItem onSelect={() => { setReplyTo(null); setEditing(m); setText(m.body); setTimeout(() => taRef.current?.focus(), 0); }}>
                              <Pencil className="h-4 w-4" /> Edit
                            </DropdownMenuItem>}
                            <DropdownMenuItem onSelect={() => { setEditing(null); setReplyTo(m); setTimeout(() => taRef.current?.focus(), 0); }}>
                              <CornerUpLeft className="h-4 w-4" /> Reply
                            </DropdownMenuItem>
                          </>
                        )}
                        {m.body && (
                          <DropdownMenuItem onSelect={() => void onCopy(m)}>
                            <Copy className="h-4 w-4" /> Copy
                          </DropdownMenuItem>
                        )}
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
                <p className="font-semibold text-primary">{editing ? "Editing message" : "Replying to your message"}</p>
                <p className="truncate text-muted-foreground">{(editing ?? replyTo)!.body}</p>
              </div>
              <button aria-label="Cancel" onClick={() => { if (editing) setText(""); setEditing(null); setReplyTo(null); }} className="rounded-full p-1 hover:bg-background">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {recording && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
              <span className="flex-1 font-medium text-foreground">Recording… {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}</span>
              <button onClick={() => stopRecording(true)} aria-label="Cancel recording" className="rounded-full p-1 hover:bg-background"><X className="h-4 w-4" /></button>
            </div>
          )}
          {staged && (
            <div className="mb-2 flex items-center gap-3 rounded-xl bg-secondary p-2">
              {staged.kind === "image" && <img src={staged.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />}
              {staged.kind === "video" && <video src={staged.preview} className="h-16 w-16 rounded-lg object-cover" muted />}
              {staged.kind === "pdf" && <FileText className="h-10 w-10 text-primary" />}
              {staged.kind === "audio" && <audio src={staged.preview} controls className="h-10 max-w-[220px]" />}
              <p className="min-w-0 flex-1 truncate text-sm text-foreground">{staged.kind === "audio" ? "Voice message" : staged.file.name}</p>
              <button onClick={() => setStaged(null)} disabled={uploading} aria-label="Remove file" className="rounded-full p-1 hover:bg-background"><X className="h-4 w-4" /></button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border-2 border-primary/30 bg-background p-1.5 shadow-sm transition focus-within:border-primary">
            <input ref={fileRef} type="file" hidden accept="image/*,video/*,application/pdf"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void stageFile(f); }} />
            <input ref={camRef} type="file" hidden accept="image/*,video/*" capture="environment"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void stageFile(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || recording || !!editing || !!staged} aria-label="Attach file"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary transition hover:bg-secondary disabled:opacity-40">
              <Paperclip className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => camRef.current?.click()} disabled={uploading || recording || !!editing || !!staged} aria-label="Take photo or video"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary transition hover:bg-secondary disabled:opacity-40">
              <Camera className="h-5 w-5" />
            </button>
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
            <button type="button" onClick={() => (recording ? stopRecording() : void startRecording())} disabled={uploading || !!editing || !!staged}
              aria-label={recording ? "Stop recording" : "Record voice"}
              className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-40", recording ? "bg-destructive text-destructive-foreground" : "text-primary hover:bg-secondary")}>
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
            </button>
            <button
              onClick={() => void send()}
              disabled={(!text.trim() && !staged) || sending || uploading || recording}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
