import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
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
  Users,
  ShieldCheck,
  LogOut,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MESSAGE_MAX,
  dateLabel,
  deleteMessage,
  editMessage,
  getGroupDetails,
  leaveGroup,
  loadThread,
  markRead,
  myId,
  sendGroupMessage,
  type Attachment,
  type GroupDetails,
  type Message,
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

export const Route = createFileRoute("/_authenticated/group/$groupId")({
  head: () => ({
    meta: [
      { title: "Group Chat — Purpose" },
      { name: "description", content: "End-to-end encrypted group messaging." },
      { property: "og:title", content: "Group Chat — Purpose" },
      { property: "og:description", content: "End-to-end encrypted group messaging." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupChatPage,
});

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function FormattedMessage({ text, isMine }: { text: string; isMine?: boolean }) {
  if (!text) return null;
  const pattern = /(```[\s\S]+?```|`[^`\n]+`|\*[^\s*](?:[^*]*?[^\s*])?\*|_[^\s_](?:[^_]*?[^\s_])?_|~[^\s~](?:[^~]*?[^\s~])?~)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${match.index}-${token.length}`;

    if (token.startsWith("```") && token.endsWith("```") && token.length >= 6) {
      const code = token.slice(3, -3).replace(/^\n/, "");
      parts.push(
        <pre
          key={key}
          className={cn(
            "my-1 overflow-x-auto rounded-lg p-2 font-mono text-xs",
            isMine ? "bg-black/25 text-white" : "bg-black/10 dark:bg-white/10"
          )}
        >
          <code>{code}</code>
        </pre>
      );
    } else if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
      parts.push(
        <code
          key={key}
          className={cn(
            "rounded px-1 py-0.5 font-mono text-[13px]",
            isMine ? "bg-black/25 text-white" : "bg-black/10 dark:bg-white/10"
          )}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
      parts.push(
        <strong key={key} className="font-bold">
          {token.slice(1, -1)}
        </strong>
      );
    } else if (token.startsWith("_") && token.endsWith("_") && token.length >= 2) {
      parts.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("~") && token.endsWith("~") && token.length >= 2) {
      parts.push(
        <s key={key} className="line-through opacity-80">
          {token.slice(1, -1)}
        </s>
      );
    } else {
      parts.push(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <span>
      {parts.map((p, idx) => (
        <Fragment key={idx}>{p}</Fragment>
      ))}
    </span>
  );
}

function DecryptedMedia({
  url,
  type,
  name,
  attKey,
  attIv,
  isDark,
}: {
  url: string;
  type: "image" | "video" | "pdf" | "audio";
  name: string;
  attKey?: string | null;
  attIv?: string | null;
  isDark: boolean;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => getCachedDecryptedMedia(url));
  const [loading, setLoading] = useState(!blobUrl);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (blobUrl || !attKey || !attIv) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);

    downloadAndDecryptMedia(url, attKey, attIv, type === "image" ? "image/jpeg" : type === "video" ? "video/mp4" : "application/octet-stream")
      .then((decryptedBlobUrl) => {
        if (!cancelled) {
          cacheDecryptedMedia(url, decryptedBlobUrl);
          setBlobUrl(decryptedBlobUrl);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to decrypt group media:", err);
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, attKey, attIv, type, blobUrl]);

  if (loading) {
    return (
      <div className="flex h-36 w-48 items-center justify-center rounded-xl bg-black/10 dark:bg-white/10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl p-3 text-xs bg-destructive/10 text-destructive">
        <span>Failed to decrypt attachment.</span>
      </div>
    );
  }

  const effectiveUrl = blobUrl || url;

  if (type === "image") {
    return (
      <img
        src={effectiveUrl}
        alt={name}
        className="max-h-72 max-w-full rounded-xl object-contain shadow-sm"
        loading="lazy"
      />
    );
  }

  if (type === "video") {
    return (
      <video
        src={effectiveUrl}
        controls
        className="max-h-72 max-w-full rounded-xl shadow-sm"
      />
    );
  }

  if (type === "audio") {
    return (
      <audio src={effectiveUrl} controls className="w-full max-w-xs" />
    );
  }

  return (
    <a
      href={effectiveUrl}
      download={name}
      className={cn(
        "flex items-center gap-3 rounded-xl p-3 text-xs transition-opacity hover:opacity-90",
        isDark ? "bg-white/10 text-white" : "bg-black/10 text-foreground"
      )}
    >
      <FileText className="h-6 w-6 shrink-0 text-primary" />
      <span className="truncate font-medium">{name}</span>
    </a>
  );
}

function GroupChatPage() {
  const { groupId } = Route.useParams();
  const [bg] = useBackground();
  const isDark = isDarkBackground(bg);
  const navigate = useNavigate();

  const [me, setMe] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadData = async () => {
    const myUserId = await myId();
    if (!myUserId) {
      void navigate({ to: "/login" as any });
      return;
    }
    setMe(myUserId);

    const details = await getGroupDetails(groupId);
    setGroup(details);

    const msgs = await loadThread(myUserId, groupId);
    setMessages(msgs);
    void markRead(myUserId, groupId);
  };

  useEffect(() => {
    void loadData();
    const onChange = () => {
      void loadData();
    };
    window.addEventListener("purpose-vault-change", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener("purpose-vault-change", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [groupId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim() && !attachment) return;
    if (sending) return;

    if (editingMessage) {
      try {
        await editMessage(editingMessage.id, text.trim());
        setEditingMessage(null);
        setText("");
        void loadData();
      } catch (err: any) {
        toast.error(err?.message || "Failed to edit message");
      }
      return;
    }

    setSending(true);
    try {
      await sendGroupMessage(groupId, text.trim(), replyTo?.id ?? null, attachment);
      setText("");
      setAttachment(null);
      setReplyTo(null);
      void loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setUploading(true);
    try {
      // 1. Client-side AES-GCM encryption
      const { encryptedBlob, key, iv } = await encryptAttachment(file);
      // 2. Upload ciphertext to Cloudflare R2
      const url = await uploadMedia(encryptedBlob, validation.kind as FileKind, file.name);
      setAttachment({
        url,
        type: validation.kind as "image" | "video" | "pdf" | "audio",
        name: file.name,
        key,
        iv,
      });
      toast.success("Attachment ready (encrypted)");
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm("Are you sure you want to leave this group?")) return;
    try {
      await leaveGroup(groupId);
      toast.success("You left the group");
      void navigate({ to: "/home" });
    } catch (err: any) {
      toast.error(err?.message || "Failed to leave group");
    }
  };

  const getSenderName = (senderId: string) => {
    if (senderId === me) return "You";
    const member = group?.members.find((m) => m.user_id === senderId);
    return member?.profile.username || "Member";
  };

  return (
    <div
      className="flex h-screen flex-col"
      style={{ backgroundColor: bg }}
    >
      {/* Group Header */}
      <header
        className={cn(
          "sticky top-0 z-10 flex items-center justify-between border-b px-4 py-2.5 backdrop-blur-md",
          isDark ? "border-white/10 bg-black/20 text-white" : "border-black/5 bg-white/40 text-foreground"
        )}
      >
        <div className="flex items-center gap-3">
          <Link
            to="/home"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/10 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div
            onClick={() => setInfoOpen(true)}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-bold">
              {group?.avatar_url ? (
                <img src={group.avatar_url} alt={group.name} className="h-full w-full rounded-full object-cover" />
              ) : (
                <Users className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">{group?.name || "Group"}</h2>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3 text-emerald-500" />
                <span>{group?.members.length ?? 0} members • End-to-end encrypted</span>
              </p>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-2xl">
            <DropdownMenuItem onClick={() => setInfoOpen(true)} className="cursor-pointer">
              <Users className="mr-2 h-4 w-4" /> Group Info
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLeaveGroup} className="text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" /> Leave Group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Messages Scroll Area */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, idx) => {
          const isMine = m.sender_id === me;
          const senderName = getSenderName(m.sender_id);
          const prevMsg = messages[idx - 1];
          const showDate = !prevMsg || dateLabel(prevMsg.created_at) !== dateLabel(m.created_at);

          return (
            <div key={m.id} className="space-y-2">
              {showDate && (
                <div className="flex justify-center my-3">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-wide",
                      isDark ? "bg-white/10 text-white/80" : "bg-black/5 text-muted-foreground"
                    )}
                  >
                    {dateLabel(m.created_at)}
                  </span>
                </div>
              )}

              <div className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
                {/* Sender Name in Group Chat */}
                {!isMine && (
                  <span className="ml-3 mb-1 text-[11px] font-semibold text-primary">
                    {senderName}
                  </span>
                )}

                <div
                  className={cn(
                    "group relative max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                    isMine
                      ? "rounded-tr-none bg-primary text-primary-foreground"
                      : isDark
                      ? "rounded-tl-none bg-neutral-800 text-neutral-100"
                      : "rounded-tl-none bg-white text-foreground"
                  )}
                >
                  {/* Reply Reference Preview */}
                  {m.reply_to_id && (
                    <div
                      className={cn(
                        "mb-1.5 rounded-lg border-l-2 border-primary/60 px-2 py-1 text-[11px]",
                        isMine ? "bg-black/15 text-white/90" : "bg-foreground/5 text-muted-foreground"
                      )}
                    >
                      <span>In reply to previous message</span>
                    </div>
                  )}

                  {/* Attachment if present */}
                  {m.attachment_url && m.attachment_type && (
                    <div className="mb-2">
                      <DecryptedMedia
                        url={m.attachment_url}
                        type={m.attachment_type}
                        name={m.attachment_name || "Attachment"}
                        attKey={m.attachment_key}
                        attIv={m.attachment_iv}
                        isDark={isDark}
                      />
                    </div>
                  )}

                  {/* Body Text */}
                  {m.deleted_at ? (
                    <em className="text-xs opacity-70">Message deleted</em>
                  ) : (
                    <FormattedMessage text={m.body} isMine={isMine} />
                  )}

                  {/* Time and Status Ticks */}
                  <div
                    className={cn(
                      "mt-1 flex items-center justify-end gap-1 text-[10px]",
                      isMine ? "text-primary-foreground/75" : "text-muted-foreground"
                    )}
                  >
                    <span>{time(m.created_at)}</span>
                    {m.edited_at && <span>(edited)</span>}
                    {isMine && <Check className="h-3 w-3" />}
                  </div>

                  {/* Action dropdown on hover / touch */}
                  <div
                    className={cn(
                      "absolute top-1 hidden group-hover:flex",
                      isMine ? "-left-8" : "-right-8"
                    )}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-full bg-background/60 shadow"
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="rounded-xl text-xs">
                        <DropdownMenuItem
                          onClick={() => {
                            setReplyTo(m);
                            textareaRef.current?.focus();
                          }}
                        >
                          <CornerUpLeft className="mr-2 h-3.5 w-3.5" /> Reply
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            void navigator.clipboard.writeText(m.body);
                            toast.success("Copied to clipboard");
                          }}
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                        </DropdownMenuItem>
                        {isMine && !m.deleted_at && (
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingMessage(m);
                              setText(m.body);
                              textareaRef.current?.focus();
                            }}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={async () => {
                            if (me) {
                              await deleteMessage(m, me);
                              void loadData();
                            }
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </main>

      {/* Reply or Editing Banner */}
      {(replyTo || editingMessage || attachment) && (
        <div
          className={cn(
            "flex items-center justify-between px-4 py-2 text-xs border-t",
            isDark ? "bg-neutral-900 border-white/10 text-white" : "bg-neutral-50 border-black/5"
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {replyTo && (
              <>
                <CornerUpLeft className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">
                  Replying to <strong>{getSenderName(replyTo.sender_id)}</strong>: {replyTo.body}
                </span>
              </>
            )}
            {editingMessage && (
              <>
                <Pencil className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Editing message</span>
              </>
            )}
            {attachment && (
              <>
                <Paperclip className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">Ready: {attachment.name}</span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full"
            onClick={() => {
              setReplyTo(null);
              setEditingMessage(null);
              setAttachment(null);
              if (editingMessage) setText("");
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Input Footer */}
      <footer
        className={cn(
          "sticky bottom-0 border-t p-3 backdrop-blur-md",
          isDark ? "border-white/10 bg-black/30" : "border-black/5 bg-white/60"
        )}
      >
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,video/*,audio/*,application/pdf"
          />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-10 w-10 shrink-0 rounded-full"
            title="Attach file"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <Paperclip className="h-5 w-5 text-muted-foreground" />
            )}
          </Button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="End-to-end encrypted message..."
            rows={1}
            maxLength={MESSAGE_MAX}
            className={cn(
              "flex-1 resize-none rounded-2xl border px-4 py-2.5 text-sm outline-none transition-all",
              "focus:ring-2 focus:ring-primary/40",
              isDark
                ? "bg-neutral-800/80 border-white/10 text-white placeholder:text-neutral-400"
                : "bg-background border-input text-foreground placeholder:text-muted-foreground"
            )}
          />

          <Button
            onClick={handleSend}
            disabled={sending || (!text.trim() && !attachment)}
            className="h-10 w-10 shrink-0 rounded-full p-0 shadow-sm"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </Button>
        </div>
      </footer>

      {/* Group Info Modal */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Users className="h-5 w-5 text-primary" />
              <span>Group Members</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="text-xs text-muted-foreground">
              {group?.members.length ?? 0} members • Created{" "}
              {group?.created_at ? new Date(group.created_at).toLocaleDateString() : ""}
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {group?.members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between p-2 rounded-xl bg-secondary/40"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {m.profile.username[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {m.profile.username} {m.user_id === me && "(You)"}
                      </p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3 text-emerald-500" />
                        <span>E2EE Ready</span>
                      </p>
                    </div>
                  </div>
                  {m.role === "admin" && (
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      Admin
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}