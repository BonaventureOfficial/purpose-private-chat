import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  Mic,
  Square,
  Check,
  FileText,
  Loader2,
  Paperclip,
  Copy,
  CornerUpLeft,
  Lock,
  MoreVertical,
  Pencil,
  SendHorizontal,
  Trash2,
  X,
  Bold,
  Italic,
  Strikethrough,
  Code as CodeIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MESSAGE_MAX,
  dateLabel,
  deleteMessage,
  editMessage,
  getProfile,
  loadThread,
  markRead,
  myId,
  sendMessage,
  type Attachment,
  type Message,
  type PublicProfile,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { uploadMedia, validateFile, type FileKind } from "@/lib/media";
import {
  encryptAttachment,
  downloadAndDecryptMedia,
  getCachedDecryptedMedia,
  cacheDecryptedMedia,
} from "@/lib/crypto";
import { useBackground } from "@/components/purpose/AppShell";
import { isDarkBackground } from "@/lib/purpose";

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

function FormattedMessage({ text, isMine }: { text: string; isMine?: boolean }) {
  if (!text) return null;
  const pattern = /(```[\s\S]+?```|`[^`\n]+`|\*[^\s*](?:[^*]*?[^\s*])?\*|_[^\s_](?:[^_]*?[^\s_])?_|~[^\s~](?:[^~]*?[^\s~])?~)/g;
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        if (part.startsWith("```") && part.endsWith("```") && part.length >= 6) {
          return (
            <pre
              key={index}
              className={cn(
                "my-1 overflow-x-auto rounded-lg p-2 font-mono text-xs",
                isMine ? "bg-black/25 text-white" : "bg-secondary text-foreground"
              )}
            >
              {part.slice(3, -3).replace(/^\n+|\n+$/g, "")}
            </pre>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
          return (
            <code
              key={index}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[13px]",
                isMine ? "bg-black/25 text-white" : "bg-secondary text-foreground"
              )}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length >= 3) {
          return (
            <strong key={index} className="font-bold tracking-wide">
              {part.slice(1, -1)}
            </strong>
          );
        }
        if (part.startsWith("_") && part.endsWith("_") && part.length >= 3) {
          return (
            <em key={index} className="italic">
              {part.slice(1, -1)}
            </em>
          );
        }
        if (part.startsWith("~") && part.endsWith("~") && part.length >= 3) {
          return (
            <del key={index} className="line-through opacity-85">
              {part.slice(1, -1)}
            </del>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

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

function DecryptedAttachment({
  url,
  type,
  name,
  encKey,
  iv,
  mine,
}: {
  url: string;
  type: "image" | "video" | "pdf" | "audio";
  name: string | null;
  encKey?: string | null;
  iv?: string | null;
  mine: boolean;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => {
    if (!encKey || !iv) return url;
    return getCachedDecryptedMedia(url) ?? null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (!encKey || !iv) return false;
    return !getCachedDecryptedMedia(url);
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!encKey || !iv) {
      setBlobUrl(url);
      setLoading(false);
      return;
    }
    const cached = getCachedDecryptedMedia(url);
    if (cached) {
      setBlobUrl(cached);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const mime =
      type === "image"
        ? "image/jpeg"
        : type === "video"
        ? "video/mp4"
        : type === "audio"
        ? "audio/webm"
        : "application/pdf";

    downloadAndDecryptMedia(url, encKey, iv, mime)
      .then((decryptedUrl) => {
        if (active) {
          setBlobUrl(decryptedUrl);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error("Failed to decrypt attachment:", err);
          setError("Failed to decrypt media");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [url, encKey, iv, type]);

  if (loading) {
    return (
      <div className="flex h-24 w-40 items-center justify-center rounded-xl bg-black/10">
        <Loader2 className="h-5 w-5 animate-spin opacity-60" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-destructive/15 px-3 py-2 text-xs text-destructive">
        <Lock className="h-4 w-4" />
        <span>{error ?? "Encrypted media unavailable"}</span>
      </div>
    );
  }

  return (
    <span className="mb-1 block">
      {type === "image" && (
        <a href={blobUrl} target="_blank" rel="noreferrer">
          <img
            src={blobUrl}
            alt={name ?? "Image"}
            className="max-h-72 rounded-xl object-cover"
            loading="lazy"
          />
        </a>
      )}
      {type === "video" && (
        <video src={blobUrl} controls preload="metadata" className="max-h-72 rounded-xl" />
      )}
      {type === "audio" && (
        <audio src={blobUrl} controls preload="metadata" className="w-64 max-w-full" />
      )}
      {type === "pdf" && (
        <a
          href={blobUrl}
          target="_blank"
          download={name ?? "Document.pdf"}
          rel="noreferrer"
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2",
            mine ? "bg-primary-foreground/10" : "bg-secondary"
          )}
        >
          <FileText className="h-6 w-6 shrink-0" />
          <span className="truncate text-sm font-medium">{name ?? "Document.pdf"}</span>
        </a>
      )}
    </span>
  );
}

function ChatPage() {
  const { userId } = Route.useParams();
  const { theme } = useBackground();
  const darkWall = isDarkBackground(theme);
  const [partner, setPartner] = useState<PublicProfile | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [pending, setPending] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ file: File; kind: FileKind } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const cancelRecRef = useRef(false);

  useEffect(() => {
    void myId().then(setMe);
    void getProfile(userId).then(setPartner);
  }, [userId]);

  useEffect(() => {
    if (!me) return;
    const load = () => {
      void loadThread(me, userId).then((list) => {
        setMsgs(list);
        setPending((prev) => prev.filter((p) => !list.some((real) => real.id === p.id)));
      });
    };
    load();
    window.addEventListener("purpose-vault-change", load);
    return () => window.removeEventListener("purpose-vault-change", load);
  }, [me, userId]);

  useEffect(() => {
    if (me) void markRead(me, userId);
  }, [me, userId, msgs.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, pending.length]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function stageFile(file: File) {
    try {
      const kind = await validateFile(file);
      setStaged({ file, kind });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unsupported file.");
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      cancelRecRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelRecRef.current) return;
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
        void stageFile(file);
      };
      recRef.current = rec;
      rec.start();
      setRecSecs(0);
      setRecording(true);
    } catch {
      toast.error("Microphone access denied or unavailable.");
    }
  }

  function stopRecording(cancel = false) {
    cancelRecRef.current = cancel;
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.stop();
    }
    setRecording(false);
  }

  function applyFormat(wrapper: string) {
    const el = taRef.current;
    if (!el) {
      setText((t) => `${t}${wrapper}${wrapper}`);
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = text.slice(start, end);
    const replacement = selected ? `${wrapper}${selected}${wrapper}` : `${wrapper}${wrapper}`;
    const nextText = text.slice(0, start) + replacement + text.slice(end);
    setText(nextText);
    setTimeout(() => {
      el.focus();
      const cursor = selected ? start + replacement.length : start + wrapper.length;
      el.setSelectionRange(cursor, cursor);
    }, 0);
  }

  async function send() {
    if ((!text.trim() && !staged) || sending || !me) return;
    setSending(true);
    setErr(null);

    let att: Attachment | null = null;
    if (staged) {
      setUploading(true);
      try {
        const { encryptedFile, key, iv } = await encryptAttachment(staged.file);
        const up = await uploadMedia(encryptedFile, "media");
        att = {
          url: up,
          type: staged.kind,
          name: staged.file.name,
          key,
          iv,
        };
        cacheDecryptedMedia(up, URL.createObjectURL(staged.file));
      } catch (e) {
        setUploading(false);
        setSending(false);
        setErr(e instanceof Error ? e.message : "Upload failed");
        return;
      }
      setUploading(false);
    }

    const currentText = text.trim();
    const tempId = `pending-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: me,
      recipient_id: userId,
      body: currentText,
      reply_to_id: replyTo?.id ?? null,
      attachment_url: att?.url ?? null,
      attachment_type: att?.type ?? null,
      attachment_name: att?.name ?? null,
      attachment_key: att?.key ?? null,
      attachment_iv: att?.iv ?? null,
      created_at: new Date().toISOString(),
      read_at: null,
      edited_at: null,
      deleted_at: null,
      recipient_hidden: false,
    };

    setPending((p) => [...p, optimistic]);
    setText("");
    setStaged(null);
    const activeReply = replyTo;
    setReplyTo(null);

    try {
      const real = await sendMessage(me, userId, currentText, activeReply?.id ?? null, att);
      setPending((p) => p.filter((x) => x.id !== tempId));
      setMsgs((m) => (m.some((x) => x.id === real.id) ? m : [...m, real]));
    } catch (e) {
      setPending((p) => p.filter((x) => x.id !== tempId));
      setText(currentText);
      setErr(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function onSaveEdit() {
    if (!editing || !text.trim()) return;
    const newBody = text.trim();
    try {
      const updated = await editMessage(editing.id, newBody);
      setMsgs((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setEditing(null);
      setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not edit.");
    }
  }

  async function onDelete(m: Message) {
    if (!me) return;
    try {
      await deleteMessage(m, me);
      setMsgs((prev) =>
        m.sender_id === me
          ? prev.map((x) => (x.id === m.id ? { ...x, body: "", deleted_at: new Date().toISOString() } : x))
          : prev.filter((x) => x.id !== m.id)
      );
      if (editing?.id === m.id) {
        setEditing(null);
        setText("");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  const name = partner?.username ?? "Chat";
  const display = [...msgs, ...pending];

  return (
    <div
      className={cn(
        "relative flex h-[100dvh] flex-col overflow-hidden text-foreground",
        darkWall ? "bg-black/85" : "bg-background/80"
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden opacity-[0.035]"
      >
        <svg viewBox="0 0 200 200" className="h-[75vmin] w-[75vmin] fill-current">
          <path d="M100 20a40 40 0 0 0-40 40v20H50a20 20 0 0 0-20 20v60a20 20 0 0 0 20 20h100a20 20 0 0 0 20-20v-60a20 20 0 0 0-20-20h-10V60a40 40 0 0 0-40-40zm-24 40a24 24 0 0 1 48 0v20H76V60zm24 60a12 12 0 0 1 6 22.4V152a6 6 0 1 1-12 0v-9.6A12 12 0 0 1 100 120z" />
        </svg>
      </div>

      <header
        className={cn(
          "sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur-md",
          darkWall ? "border-white/10 bg-black/40 text-white" : "border-border/60 bg-background/70 text-foreground"
        )}
      >
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition",
              darkWall ? "hover:bg-white/10" : "hover:bg-muted"
            )}
            aria-label="Back to chats"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2.5">
            {partner?.avatar_url ? (
              <img src={partner.avatar_url} alt={name} className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-sm">
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold text-sm leading-tight">{name}</p>
              <p className="flex items-center gap-1 text-[11px] opacity-75">
                <Lock className="h-3 w-3 text-online" /> End-to-end encrypted
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {display.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground text-sm">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <p className="font-medium text-foreground">No messages yet</p>
            <p className="text-xs">Messages and attachments are end-to-end encrypted before leaving this device.</p>
          </div>
        ) : (
          display.map((m, i) => {
            const mine = m.sender_id === me;
            const isPending = m.id.startsWith("pending-");
            const awaitingDelivery = isPending || m.local_status === "queued" || m.local_status === "sent";
            const prev = display[i - 1];
            const showDate = !prev || dateLabel(prev.created_at) !== dateLabel(m.created_at);

            return (
              <Fragment key={m.id}>
                {showDate && (
                  <div className="my-2 flex justify-center">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 font-medium text-[11px] shadow-sm backdrop-blur",
                        darkWall ? "bg-white/10 text-white/80" : "bg-muted/80 text-muted-foreground"
                      )}
                    >
                      {dateLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className={cn("group flex items-start gap-1", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "relative max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm break-words",
                      mine
                        ? "rounded-tr-none bg-primary text-primary-foreground"
                        : "rounded-tl-none bg-card text-card-foreground border border-border/40"
                    )}
                  >
                    {m.reply_to_id && (() => {
                      const q = display.find((x) => x.id === m.reply_to_id);
                      return (
                        <span
                          className={cn(
                            "mb-1 block rounded-lg border-l-4 px-2 py-1 text-xs",
                            mine
                              ? "border-primary-foreground/60 bg-primary-foreground/10 text-primary-foreground"
                              : "border-primary bg-secondary text-foreground"
                          )}
                        >
                          <span className="block font-semibold">{q ? (q.sender_id === me ? "You" : name) : ""}</span>
                          <span className="line-clamp-2 opacity-85">
                            {!q || q.deleted_at ? "Message deleted" : <FormattedMessage text={q.body} isMine={mine} />}
                          </span>
                        </span>
                      );
                    })()}

                    {!m.deleted_at && m.attachment_url && (
                      <DecryptedAttachment
                        url={m.attachment_url}
                        type={m.attachment_type ?? "image"}
                        name={m.attachment_name}
                        encKey={m.attachment_key}
                        iv={m.attachment_iv}
                        mine={mine}
                      />
                    )}

                    {m.deleted_at ? (
                      <em className="opacity-70">Message deleted</em>
                    ) : (
                      <FormattedMessage text={m.body} isMine={mine} />
                    )}

                    {m.edited_at && !m.deleted_at && <span className="ml-1 text-[10px] opacity-70">(edited)</span>}
                    <span
                      className={cn(
                        "ml-2 inline-flex translate-y-0.5 items-center gap-1 text-[10px]",
                        mine ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}
                    >
                      {time(m.created_at)}
                      {mine && <Ticks sending={awaitingDelivery} read={!isPending && !!m.read_at} />}
                    </span>
                  </div>

                  {!isPending && !m.deleted_at && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Message options"
                        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-60 transition hover:bg-background hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={mine ? "end" : "start"} className="w-40">
                        {mine && !m.attachment_url && (
                          <DropdownMenuItem
                            onSelect={() => {
                              setReplyTo(null);
                              setEditing(m);
                              setText(m.body);
                              setTimeout(() => taRef.current?.focus(), 0);
                            }}
                          >
                            <Pencil className="h-4 w-4" /> Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(null);
                            setReplyTo(m);
                            setTimeout(() => taRef.current?.focus(), 0);
                          }}
                        >
                          <CornerUpLeft className="h-4 w-4" /> Reply
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            void navigator.clipboard.writeText(m.body);
                            toast.success("Copied to clipboard");
                          }}
                        >
                          <Copy className="h-4 w-4" /> Copy
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => void onDelete(m)}
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </main>

      <footer
        className={cn(
          "sticky bottom-0 z-20 border-t p-3 backdrop-blur-md",
          darkWall ? "border-white/10 bg-black/40" : "border-border/60 bg-background/80"
        )}
      >
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-secondary/80 px-3 py-1.5 text-xs text-secondary-foreground">
            <div className="truncate">
              <span className="font-semibold">{replyTo.sender_id === me ? "Replying to yourself" : `Replying to ${name}`}: </span>
              <span className="opacity-80">{replyTo.body || "Attachment"}</span>
            </div>
            <button onClick={() => setReplyTo(null)} className="p-1 hover:opacity-70" aria-label="Cancel reply">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {editing && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary">
            <span>Editing message</span>
            <button
              onClick={() => {
                setEditing(null);
                setText("");
              }}
              className="p-1 hover:opacity-70"
              aria-label="Cancel edit"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {staged && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-secondary px-3 py-1.5 text-xs">
            <span className="truncate">
              Attached ({staged.kind}): <strong>{staged.file.name}</strong>
            </span>
            <button onClick={() => setStaged(null)} className="p-1 hover:opacity-70" aria-label="Remove attachment">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {err && <p className="mb-2 text-destructive text-xs">{err}</p>}

        <div className="mb-1.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyFormat("*")}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted text-muted-foreground transition"
            title="Bold (*text*)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat("_")}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted text-muted-foreground transition"
            title="Italic (_text_)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat("~")}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted text-muted-foreground transition"
            title="Strikethrough (~text~)"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat("`")}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted text-muted-foreground transition"
            title="Code (`code`)"
          >
            <CodeIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,application/pdf,audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void stageFile(f);
              e.target.value = "";
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void stageFile(f);
              e.target.value = "";
            }}
          />

          {!recording && (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || uploading}
                aria-label="Attach file"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full"
                onClick={() => cameraInputRef.current?.click()}
                disabled={sending || uploading}
                aria-label="Take photo"
              >
                <Camera className="h-5 w-5" />
              </Button>
            </div>
          )}

          {recording ? (
            <div className="flex flex-1 items-center justify-between rounded-2xl bg-destructive/10 px-4 py-2 text-destructive text-sm">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                Recording voice note... {recSecs}s
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => stopRecording(true)}
                  className="h-8 text-destructive hover:bg-destructive/15 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => stopRecording(false)}
                  className="h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
                >
                  <Square className="mr-1 h-3 w-3" /> Finish
                </Button>
              </div>
            </div>
          ) : (
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (editing) void onSaveEdit();
                  else void send();
                }
              }}
              placeholder={editing ? "Edit message..." : "Type a secure message..."}
              maxLength={MESSAGE_MAX}
              className={cn(
                "max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border px-3.5 py-2 text-sm leading-tight focus:outline-none focus:ring-1 focus:ring-primary",
                darkWall
                  ? "border-white/15 bg-white/10 text-white placeholder:text-white/50"
                  : "border-border/80 bg-background text-foreground"
              )}
            />
          )}

          {!recording && !text.trim() && !staged && !editing && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              onClick={() => void startRecording()}
              disabled={sending || uploading}
              aria-label="Record voice note"
            >
              <Mic className="h-5 w-5" />
            </Button>
          )}

          {(text.trim() || staged || editing) && !recording && (
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              disabled={sending || uploading}
              onClick={() => {
                if (editing) void onSaveEdit();
                else void send();
              }}
              aria-label={editing ? "Save edit" : "Send message"}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <SendHorizontal className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
