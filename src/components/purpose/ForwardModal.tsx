import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Forward,
  Check,
  Users,
  MessageSquare,
  Loader2,
  Lock,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
} from "lucide-react";
import {
  listConversations,
  listMyGroups,
  forwardMessage,
  myId,
  type Conversation,
  type GroupSummary,
  type Message,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: Message | null;
  currentUserId?: string;
}

export type ForwardTarget = {
  type: "user" | "group";
  id: string;
  name: string;
  avatarUrl?: string | null;
};

export function ForwardModal({ isOpen, onClose, message, currentUserId }: ForwardModalProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, ForwardTarget>>(new Map());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelected(new Map());
      setSearch("");
      return;
    }

    let active = true;
    setLoading(true);

    void (async () => {
      try {
        const me = currentUserId || (await myId());
        if (!me) return;
        const [convs, grps] = await Promise.all([
          listConversations(me).catch(() => []),
          listMyGroups(me).catch(() => []),
        ]);
        if (active) {
          setConversations(convs);
          setGroups(grps);
        }
      } catch (err) {
        console.error("Failed to load contacts for forward:", err);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, currentUserId]);

  const targets = useMemo<ForwardTarget[]>(() => {
    const list: ForwardTarget[] = [];

    // Add Direct Conversations
    for (const c of conversations) {
      list.push({
        type: "user",
        id: c.partner.id,
        name: c.partner.username,
        avatarUrl: c.partner.avatar_url,
      });
    }

    // Add Groups
    for (const g of groups) {
      list.push({
        type: "group",
        id: g.id,
        name: g.name,
        avatarUrl: g.avatar_url,
      });
    }

    if (!search.trim()) return list;

    const query = search.trim().toLowerCase();
    return list.filter((t) => t.name.toLowerCase().includes(query));
  }, [conversations, groups, search]);

  const toggleSelect = (target: ForwardTarget) => {
    const key = `${target.type}:${target.id}`;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, target);
      }
      return next;
    });
  };

  const handleSend = async () => {
    if (!message || selected.size === 0) return;
    setSubmitting(true);
    try {
      const me = currentUserId || (await myId());
      if (!me) throw new Error("You must be logged in.");

      const targetList = Array.from(selected.values()).map((t) => ({
        type: t.type,
        id: t.id,
      }));

      await forwardMessage(me, targetList, message);
      toast.success(
        selected.size === 1
          ? "Message forwarded successfully!"
          : `Message forwarded to ${selected.size} recipients!`
      );
      onClose();
    } catch (err: any) {
      console.error("Forwarding failed:", err);
      toast.error(err?.message || "Failed to forward message.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !message) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-2xl border bg-background/95 backdrop-blur-xl">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Forward className="h-5 w-5 text-primary" />
            Transfer Message
          </DialogTitle>
        </DialogHeader>

        {/* Message preview snippet */}
        <div className="px-4 py-2.5 bg-muted/40 border-b text-xs flex items-center gap-2 text-muted-foreground">
          {message.attachment_type === "image" && <ImageIcon className="h-4 w-4 shrink-0 text-primary" />}
          {message.attachment_type === "video" && <VideoIcon className="h-4 w-4 shrink-0 text-primary" />}
          {message.attachment_type === "audio" && <Music className="h-4 w-4 shrink-0 text-primary" />}
          {message.attachment_type === "pdf" && <FileText className="h-4 w-4 shrink-0 text-primary" />}
          <span className="truncate flex-1 font-medium">
            {message.body ? message.body : message.attachment_name || "Attachment"}
          </span>
          {message.forward_locked && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-semibold shrink-0">
              <Lock className="h-3 w-3" /> Locked
            </span>
          )}
        </div>

        {/* Search input */}
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts or groups..."
              className="pl-9 h-9 text-xs rounded-xl bg-muted/50 border-border/60"
            />
          </div>
        </div>

        {/* Recipients list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[220px] max-h-[340px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-xs gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Loading recipients...</span>
            </div>
          ) : targets.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              {search ? "No matching contacts or groups found." : "No contacts available to transfer."}
            </div>
          ) : (
            targets.map((t) => {
              const isSelected = selected.has(`${t.type}:${t.id}`);
              return (
                <button
                  key={`${t.type}:${t.id}`}
                  type="button"
                  onClick={() => toggleSelect(t)}
                  className={cn(
                    "w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-colors text-xs font-medium",
                    isSelected
                      ? "bg-primary/10 border border-primary/30 text-primary"
                      : "hover:bg-muted/60 text-foreground"
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 font-bold text-xs text-primary overflow-hidden">
                      {t.avatarUrl ? (
                        <img src={t.avatarUrl} alt={t.name} className="h-full w-full object-cover" />
                      ) : t.type === "group" ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        t.name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="truncate">
                      <p className="font-semibold truncate leading-tight">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize flex items-center gap-1">
                        {t.type === "group" ? (
                          <>
                            <Users className="h-2.5 w-2.5" /> Group
                          </>
                        ) : (
                          <>
                            <MessageSquare className="h-2.5 w-2.5" /> Direct Chat
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30 bg-background"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-3 border-t bg-muted/20 flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={selected.size === 0 || submitting}
            className="rounded-xl text-xs h-9 px-4 gap-1.5 font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Forward className="h-3.5 w-3.5" />
                Transfer {selected.size > 0 && `(${selected.size})`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}