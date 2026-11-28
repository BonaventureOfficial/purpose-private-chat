import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
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
  Unlock,
  Forward,
  MoreVertical,
  Pencil,
  SendHorizontal,
  Trash2,
  X,
  Users,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  UserCheck,
  UserX,
  VolumeX,
  Volume2,
  Crown,
  Settings,
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
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MESSAGE_MAX,
  dateLabel,
  deleteGroupMessage,
  deleteMessage,
  editMessage,
  getGroupDetails,
  leaveGroup,
  loadThread,
  markRead,
  myId,
  sendGroupMessage,
  toggleMessageLock,
  setGroupOnlyAdminsCanSend,
  setMemberCanSend,
  setMemberRole,
  kickGroupMember,
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
import { PhotoEditorModal } from "@/components/purpose/PhotoEditorModal";
import { ForwardModal } from "@/components/purpose/ForwardModal";
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
  const pattern = /(```[\s\S]+?```|`[^`\n]+`|\*\*[^\s*](?:[\s\S]*?[^\s*])?\*\*|\*[^\s*](?:[^*]*?[^\s*])?\*|__\S(?:[\s\S]*?\S)?__|_[^\s_](?:[^_]*?[^\s_])?_|~~[^\s~](?:[\s\S]*?[^\s~])?~~|~[^\s~](?:[^~]*?[^\s~])?~)/g;
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
    } else if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
      parts.push(
        <strong key={key} className={cn("font-bold tracking-tight", !isMine && "text-foreground")}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
      parts.push(
        <strong key={key} className={cn("font-bold tracking-tight", !isMine && "text-foreground")}>
          {token.slice(1, -1)}
        </strong>
      );
    } else if (token.startsWith("__") && token.endsWith("__") && token.length >= 4) {
      parts.push(
        <strong key={key} className={cn("font-bold tracking-tight", !isMine && "text-foreground")}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("_") && token.endsWith("_") && token.length >= 2) {
      parts.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("~~") && token.endsWith("~~") && token.length >= 4) {
      parts.push(
        <s key={key} className="line-through opacity-80">
          {token.slice(2, -2)}
        </s>
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

    const mime =
      type === "image"
        ? "image/jpeg"
        : type === "video"
        ? "video/mp4"
        : type === "audio"
        ? "audio/webm"
        : "application/pdf";

    downloadAndDecryptMedia(url, attKey, attIv, mime)
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
      <video src={effectiveUrl} controls className="max-h-72 max-w-full rounded-xl shadow-sm" />
    );
  }

  if (type === "audio") {
    return <audio src={effectiveUrl} controls className="w-full max-w-xs" />;
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
  const applyFormat = (wrapper: string) => {
    const el = textareaRef.current;
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
  };

  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [staged, setStaged] = useState<{ file: File; kind: FileKind } | null>(null);
  const [photoToEdit, setPhotoToEdit] = useState<File | null>(null);
  const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);

  const stagedPreviewUrl = useMemo(() => {
    if (staged?.kind === "image") {
      return URL.createObjectURL(staged.file);
    }
    return null;
  }, [staged]);

  useEffect(() => {
    return () => {
      if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl);
    };
  }, [stagedPreviewUrl]);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [menuOpenForMessageId, setMenuOpenForMessageId] = useState<string | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBubblePointerDown = (msgId: string) => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate?.(40); } catch {}
      }
      setMenuOpenForMessageId(msgId);
    }, 450);
  };

  const handleBubblePointerUp = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleToggleLock = async (msg: Message) => {
    try {
      const locked = await toggleMessageLock(msg.id);
      toast.success(locked ? "Forwarding locked for this message" : "Forwarding unlocked");
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, forward_locked: locked } : m))
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to update lock status");
    }
  };
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const cancelRecRef = useRef(false);

  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
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

    const msgs = (await loadThread(myUserId, groupId)).filter((m) => !m.deleted_at);
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


  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function stageFile(file: File) {
    try {
      const kind = await validateFile(file);
      if (kind === "image") {
        setPhotoToEdit(file);
        setIsPhotoEditorOpen(true);
      } else {
        setStaged({ file, kind });
        toast.success(`${kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Document"} ready to send!`);
      }
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
  const handleSend = async () => {
    if ((!text.trim() && !staged) || sending) return;

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
      } catch (e: any) {
        setUploading(false);
        setSending(false);
        toast.error(e?.message || "Failed to upload encrypted file");
        return;
      }
      setUploading(false);
    }

    try {
      await sendGroupMessage(groupId, text.trim(), replyTo?.id ?? null, att);
      setText("");
      setStaged(null);
      setReplyTo(null);
      void loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (msg: Message) => {
    if (!me) return;
    try {
      if (msg.sender_id === me || isAdminOrOwner) {
        await deleteGroupMessage(groupId, msg);
      } else {
        await deleteMessage(msg, me);
      }
      // Immediately remove from UI completely: no placeholder, zero residue
      setMessages((prev) => prev.filter((x) => x.id !== msg.id));
      if (editingMessage?.id === msg.id) {
        setEditingMessage(null);
        setText("");
      }
      void loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete message");
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

  // Superpower handlers
  const handleToggleOnlyAdminsCanSend = async () => {
    if (!group || !group.isOwner) return;
    setUpdatingSettings(true);
    try {
      const nextVal = !group.only_admins_can_send;
      await setGroupOnlyAdminsCanSend(groupId, nextVal);
      toast.success(nextVal ? "Group restricted to admins only" : "All members can send messages");
      void loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update group setting");
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleToggleMemberRole = async (userId: string, currentRole: "admin" | "member") => {
    const newRole = currentRole === "admin" ? "member" : "admin";
    try {
      await setMemberRole(groupId, userId, newRole);
      toast.success(newRole === "admin" ? "Member promoted to Admin" : "Admin demoted to Member");
      void loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to change member role");
    }
  };

  const handleToggleMemberCanSend = async (userId: string, currentCanSend: boolean) => {
    const nextVal = !currentCanSend;
    try {
      await setMemberCanSend(groupId, userId, nextVal);
      toast.success(nextVal ? "Member can now send messages" : "Member restricted from sending messages");
      void loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update member permission");
    }
  };

  const handleKickMember = async (userId: string, username: string) => {
    if (!confirm(`Remove ${username} from the group?`)) return;
    try {
      await kickGroupMember(groupId, userId);
      toast.success(`${username} removed from the group`);
      void loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove member");
    }
  };

  const getSenderName = (senderId: string) => {
    if (senderId === me) return "You";
    const member = group?.members.find((m) => m.user_id === senderId);
    return member?.profile.username || "Member";
  };

  const getSenderProfile = (senderId: string) => {
    return group?.members.find((m) => m.user_id === senderId)?.profile;
  };

  const isOwner = Boolean(group?.isOwner);
  const isAdminOrOwner = isOwner || group?.myRole === "admin";
  const canSend = Boolean(group?.canSend);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden" style={{ backgroundColor: bg }}>
      {/* Mathematical Guilloche Security Watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden opacity-[0.035] dark:opacity-[0.06] select-none text-foreground pointer-events-none"
      >
        <svg
          viewBox="0 0 800 800"
          className="h-[120vmax] w-[120vmax] max-w-none shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
        >
          <circle cx="400" cy="400" r="380" strokeDasharray="3 3" />
          <circle cx="400" cy="400" r="360" strokeWidth="1.2" />
          <circle cx="400" cy="400" r="340" strokeDasharray="1 3" />
          <circle cx="400" cy="400" r="220" />
          <circle cx="400" cy="400" r="140" strokeDasharray="4 4" />
          <circle cx="400" cy="400" r="80" />
          {Array.from({ length: 24 }).map((_, i) => (
            <ellipse key={`outer-${i}`} cx="400" cy="400" rx="340" ry="120" transform={`rotate(${i * 15} 400 400)`} />
          ))}
          {Array.from({ length: 36 }).map((_, i) => (
            <ellipse key={`inner-${i}`} cx="400" cy="400" rx="220" ry="70" transform={`rotate(${i * 10} 400 400)`} />
          ))}
          {Array.from({ length: 18 }).map((_, i) => (
            <ellipse key={`core-${i}`} cx="400" cy="400" rx="140" ry="40" transform={`rotate(${i * 20} 400 400)`} />
          ))}
          {Array.from({ length: 17 }).map((_, i) => {
            const y = 80 + i * 40;
            return <path key={`wave-${i}`} d={`M 0,${y} Q 200,${y + 14} 400,${y} T 800,${y}`} strokeDasharray="6 4" strokeWidth="0.6" />;
          })}
        </svg>
      </div>
      {/* Group Header */}
      <header
        className={cn("relative z-10",
          "sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur-xl shadow-xs transition-colors",
          isDark ? "border-white/10 bg-black/55 text-white" : "border-border/50 bg-background/80 text-foreground"
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
                <img
                  src={group.avatar_url}
                  alt={group.name}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <Users className="h-5 w-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold leading-tight">{group?.name || "Group"}</h2>
                {isOwner && <Crown className="h-3.5 w-3.5 text-amber-500" title="You are the Owner" />}
              </div>
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
          <DropdownMenuContent align="end" className="w-52 rounded-2xl">
            <DropdownMenuItem onClick={() => setInfoOpen(true)} className="cursor-pointer">
              <Users className="mr-2 h-4 w-4" /> Group Info & Powers
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLeaveGroup} className="text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" /> Leave Group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Messages Scroll Area */}
      <main className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.filter((m) => !m.deleted_at).map((m, idx) => {
          const isMine = m.sender_id === me;
          const senderName = getSenderName(m.sender_id);
          const senderProfile = getSenderProfile(m.sender_id);
          const prevMsg = messages[idx - 1];
          const showDate = !prevMsg || dateLabel(prevMsg.created_at) !== dateLabel(m.created_at);
          const canDeleteThisMessage = isMine || isAdminOrOwner;

          return (
            <div key={m.id} className="space-y-2">
              {showDate && (
                <div className="flex justify-center my-3">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-wider backdrop-blur-md border shadow-xs",
                      isDark ? "border-white/10 bg-black/40 text-white/90" : "border-border/50 bg-background/80 text-muted-foreground"
                    )}
                  >
                    {dateLabel(m.created_at)}
                  </span>
                </div>
              )}

              <div className={cn("flex gap-2 max-w-full", isMine ? "justify-end" : "justify-start")}>
                {!isMine && (
                  <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0 self-end mb-1 overflow-hidden ring-1 ring-border shadow-xs">
                    {senderProfile?.avatar_url ? (
                      <img
                        src={senderProfile.avatar_url}
                        alt={senderName}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      senderName[0]?.toUpperCase()
                    )}
                  </div>
                )}
                <div className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
                  {!isMine && (
                    <span className="ml-1 mb-1 text-[11px] font-semibold text-primary">
                      {senderName}
                    </span>
                  )}

                <div className={cn("flex items-center gap-1.5 max-w-full", isMine ? "flex-row-reverse" : "flex-row")}>
                  <div
                    className={cn(
                      "relative max-w-[82%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed shadow-sm md:max-w-[65%] break-words transition-all",
                      isMine
                        ? "rounded-br-xs bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground shadow-md shadow-primary/20 border border-primary-foreground/15"
                        : "rounded-tl-xs bg-card/90 backdrop-blur-md text-card-foreground border border-border/60 shadow-xs dark:bg-zinc-900/85 dark:border-white/10"
                    )}
                  >
                    {m.reply_to_id && (
                      <div
                        className={cn(
                          "mb-2 rounded-xl border-l-3 px-3 py-1.5 text-xs backdrop-blur-xs",
                          isMine
                            ? "border-primary-foreground/75 bg-black/20 text-primary-foreground"
                            : "border-primary bg-primary/10 text-card-foreground"
                        )}
                      >
                        <span className="font-semibold text-[11px]">In reply to previous message</span>
                      </div>
                    )}

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

                    <FormattedMessage text={m.body} isMine={isMine} />

                    <div
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1 text-[10px]",
                        isMine ? "text-primary-foreground/75" : "text-muted-foreground"
                      )}
                    >
                      <span>{time(m.created_at)}</span>
                      {m.forward_locked && (
                        <span
                          title="Forwarding locked by sender"
                          className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] ml-1 font-semibold px-1.5 py-0.2 rounded-full shadow-xs",
                            isMine ? "bg-black/25 text-primary-foreground" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          )}
                        >
                          <Lock className="h-2.5 w-2.5 inline" />
                          <span>Locked</span>
                        </span>
                      )}
                      {m.edited_at && <span>(edited)</span>}
                      {isMine && <Check className="h-3 w-3" />}
                    </div>
                  </div>

                  <DropdownMenu
                    open={menuOpenForMessageId === m.id}
                    onOpenChange={(open) => setMenuOpenForMessageId(open ? m.id : null)}
                  >
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 rounded-full p-1 opacity-70 hover:opacity-100 focus:opacity-100 transition-opacity shrink-0",
                            isDark ? "text-white/70 hover:bg-white/10" : "text-muted-foreground hover:bg-muted"
                          )}
                          aria-label="Message options"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isMine ? "end" : "start"} className="w-44 rounded-xl text-xs">
                        <DropdownMenuItem
                          onClick={() => {
                            void navigator.clipboard.writeText(m.body);
                            toast.success("Copied to clipboard");
                          }}
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                        </DropdownMenuItem>

                        {/* Forward & Lock options */}
                        {isMine ? (
                          <>
                            <DropdownMenuItem onClick={() => setForwardingMessage(m)}>
                              <Forward className="mr-2 h-3.5 w-3.5 text-primary" /> Forward
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handleToggleLock(m)}>
                              {m.forward_locked ? (
                                <>
                                  <Unlock className="mr-2 h-3.5 w-3.5 text-emerald-500" /> Unlock Forwarding
                                </>
                              ) : (
                                <>
                                  <Lock className="mr-2 h-3.5 w-3.5 text-amber-500" /> Lock Forwarding
                                </>
                              )}
                            </DropdownMenuItem>
                          </>
                        ) : m.forward_locked ? (
                          <DropdownMenuItem disabled className="opacity-60 cursor-not-allowed text-muted-foreground">
                            <Lock className="mr-2 h-3.5 w-3.5 text-amber-500" /> Forwarding locked
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setForwardingMessage(m)}>
                            <Forward className="mr-2 h-3.5 w-3.5 text-primary" /> Forward
                          </DropdownMenuItem>
                        )}
                        {isMine && (
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
                          onClick={() => {
                            setReplyTo(m);
                            textareaRef.current?.focus();
                          }}
                        >
                          <CornerUpLeft className="mr-2 h-3.5 w-3.5" /> Reply
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => void handleDeleteMessage(m)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          {isMine ? "Delete" : isAdminOrOwner ? "Delete (Admin)" : "Delete"}
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

      {/* Reply or Editing or Staged Attachment Banner */}
      {(replyTo || editingMessage || staged) && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-4 py-2 text-xs border-t",
            isDark ? "bg-neutral-900 border-white/10 text-white" : "bg-neutral-50 border-black/5"
          )}
        >
          {staged ? (
            <div className="flex items-center gap-3 overflow-hidden">
              {staged.kind === "image" ? (
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-black/10">
                  <img
                    src={stagedPreviewUrl || undefined}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
              )}
              <div className="flex flex-col truncate">
                <span className="truncate font-medium">{staged.file.name}</span>
                <span className="text-[11px] text-muted-foreground capitalize">
                  {staged.kind} • {(staged.file.size / 1024).toFixed(0)} KB
                </span>
              </div>
            </div>
          ) : (
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
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {staged?.kind === "image" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPhotoToEdit(staged.file);
                  setIsPhotoEditorOpen(true);
                }}
                className="h-8 gap-1.5 px-2.5 text-xs text-primary hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit 3D</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (staged) setStaged(null);
                if (replyTo) setReplyTo(null);
                if (editingMessage) {
                  setEditingMessage(null);
                  setText("");
                }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Input Footer or Restricted Banner */}
      <footer
        className={cn(
          "relative z-10 sticky bottom-0 z-20 border-t p-3 backdrop-blur-xl shadow-lg transition-colors",
          isDark ? "border-white/10 bg-black/60" : "border-border/50 bg-background/80"
        )}
      >
        {!canSend ? (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
            <VolumeX className="h-4 w-4 text-destructive" />
            <span>
              {group?.only_admins_can_send && !isAdminOrOwner
                ? "Only administrators are permitted to send messages in this group."
                : "You have been restricted from sending messages in this group by an administrator."}
            </span>
          </div>
        ) : (
          <div className="space-y-1.5 max-w-4xl mx-auto">
            <div className="flex items-center gap-1">
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
                type="file"
                ref={cameraInputRef}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void stageFile(f);
                  e.target.value = "";
                }}
                accept="image/*"
                capture="environment"
                className="hidden"
              />
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void stageFile(f);
                  e.target.value = "";
                }}
                accept="image/*,video/*,audio/*,application/pdf"
                className="hidden"
              />

              {recording ? (
                <div className="flex flex-1 items-center gap-2 rounded-2xl bg-destructive/15 px-3 py-2 text-destructive">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                  <span className="font-mono text-sm font-semibold">
                    {Math.floor(recSecs / 60)}:{(recSecs % 60).toString().padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-xs">Recording encrypted audio...</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => stopRecording(true)}
                    className="h-7 text-xs hover:bg-destructive/20"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => stopRecording(false)}
                    className="h-7 gap-1 px-2.5 text-xs font-semibold"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span>Done</span>
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={uploading || sending}
                    className="h-10 w-10 shrink-0 rounded-full"
                    title="Take photo (with 3D annotations)"
                  >
                    <Camera className="h-5 w-5 text-muted-foreground" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sending}
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
                      "flex-1 resize-none rounded-2xl border px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/30",
                      isDark
                        ? "bg-white/10 border-white/15 text-white placeholder:text-white/50 focus:border-white/30"
                        : "bg-background/90 border-border/60 text-foreground placeholder:text-muted-foreground focus:border-primary/50 shadow-inner"
                    )}
                  />

                  {!text.trim() && !staged && !editingMessage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={startRecording}
                      disabled={sending || uploading}
                      className="h-10 w-10 shrink-0 rounded-full hover:text-primary"
                      title="Hold to record voice"
                    >
                      <Mic className="h-5 w-5 text-muted-foreground" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleSend}
                      disabled={sending || (!text.trim() && !staged)}
                      className="h-10 w-10 shrink-0 rounded-full p-0 bg-gradient-to-tr from-primary to-primary/85 text-primary-foreground shadow-md shadow-primary/25 hover:shadow-primary/40 active:scale-95 transition-all"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <SendHorizontal className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </footer>

      {/* Group Info & Superpowers Modal */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md rounded-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Users className="h-5 w-5 text-primary" />
              <span>Group Settings & Members</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2 space-y-4">
            {/* Group info header */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-secondary/50">
              <div>
                <p className="text-base font-bold">{group?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {group?.members.length ?? 0} members • Created{" "}
                  {group?.created_at ? new Date(group.created_at).toLocaleDateString() : ""}
                </p>
              </div>
              {isOwner && (
                <span className="flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full">
                  <Crown className="h-3.5 w-3.5" /> Group Owner
                </span>
              )}
            </div>

            {/* Owner Superpower: Toggle Only Admins Can Send */}
            {isOwner && (
              <div className="p-3 rounded-2xl border border-primary/20 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Send Permission</p>
                    <p className="text-xs text-muted-foreground">
                      {group?.only_admins_can_send
                        ? "Restricted: Only admins and owner can send"
                        : "Open: All authorized members can send"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={group?.only_admins_can_send ? "default" : "outline"}
                    onClick={handleToggleOnlyAdminsCanSend}
                    disabled={updatingSettings}
                    className="rounded-xl text-xs"
                  >
                    {group?.only_admins_can_send ? "Allow Everyone" : "Admins Only"}
                  </Button>
                </div>
              </div>
            )}

            {/* Member List */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground px-1">
                Members Roster
              </p>
              <div className="space-y-2">
                {group?.members.map((m) => {
                  const isThisMemberOwner = m.user_id === group.created_by;
                  const isThisMe = m.user_id === me;
                  const hasKeys = Boolean(m.profile.public_key);

                  // Superpower permissions:
                  // Owner can manage everyone except themselves
                  // Admin can manage regular members
                  const canManageThisUser =
                    !isThisMe &&
                    (isOwner || (isAdminOrOwner && m.role !== "admin" && !isThisMemberOwner));

                  return (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/40 hover:bg-secondary/60 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {m.profile.avatar_url ? (
                            <img
                              src={m.profile.avatar_url}
                              alt={m.profile.username}
                              className="h-full w-full rounded-full object-cover"
                            />
                          ) : (
                            m.profile.username[0]?.toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold truncate">
                              {m.profile.username}
                            </span>
                            {isThisMe && (
                              <span className="text-[10px] text-muted-foreground">(You)</span>
                            )}
                            {isThisMemberOwner ? (
                              <span className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                <Crown className="h-2.5 w-2.5" /> Owner
                              </span>
                            ) : m.role === "admin" ? (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                Admin
                              </span>
                            ) : null}
                            {!m.can_send && (
                              <span className="flex items-center gap-0.5 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                                <VolumeX className="h-2.5 w-2.5" /> Muted
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            {hasKeys ? (
                              <>
                                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                                <span>E2EE Ready</span>
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="h-3 w-3 text-amber-500" />
                                <span>Keys pending (tolerated)</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Management Action Menu */}
                      {canManageThisUser && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-2xl text-xs">
                            {/* Role management: Owner only */}
                            {isOwner && (
                              <DropdownMenuItem
                                onClick={() => handleToggleMemberRole(m.user_id, m.role)}
                                className="cursor-pointer"
                              >
                                {m.role === "admin" ? (
                                  <>
                                    <UserX className="mr-2 h-3.5 w-3.5" /> Demote to Member
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="mr-2 h-3.5 w-3.5" /> Promote to Admin
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}

                            {/* Mute / Unmute message sending */}
                            <DropdownMenuItem
                              onClick={() => handleToggleMemberCanSend(m.user_id, m.can_send)}
                              className="cursor-pointer"
                            >
                              {m.can_send ? (
                                <>
                                  <VolumeX className="mr-2 h-3.5 w-3.5 text-destructive" />
                                  <span className="text-destructive">Mute / Ban from sending</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="mr-2 h-3.5 w-3.5 text-primary" />
                                  <span>Allow sending messages</span>
                                </>
                              )}
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {/* Kick member */}
                            <DropdownMenuItem
                              onClick={() => handleKickMember(m.user_id, m.profile.username)}
                              className="cursor-pointer text-destructive"
                            >
                              <LogOut className="mr-2 h-3.5 w-3.5" /> Remove from group
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3D Photo Editor Modal */}
      {isPhotoEditorOpen && photoToEdit && (
        <PhotoEditorModal
          file={photoToEdit}
          isOpen={isPhotoEditorOpen}
          open={isPhotoEditorOpen}
          onClose={() => {
            setIsPhotoEditorOpen(false);
            setPhotoToEdit(null);
          }}
          onSave={(editedFile) => {
            setStaged({ file: editedFile, kind: "image" });
            setIsPhotoEditorOpen(false);
            setPhotoToEdit(null);
            toast.success("Photo edited and attached!");
          }}
          onSkipEdit={(origFile) => {
            setStaged({ file: origFile, kind: "image" });
            setIsPhotoEditorOpen(false);
            setPhotoToEdit(null);
            toast.success("Photo attached!");
          }}
          onSkip={(origFile) => {
            setStaged({ file: origFile, kind: "image" });
            setIsPhotoEditorOpen(false);
            setPhotoToEdit(null);
            toast.success("Photo attached!");
          }}
        />
      )}
    </div>
  );
}