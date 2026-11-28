import { useState, useEffect, useMemo, useRef } from "react";
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
  listDirectoryUsers,
  searchPeople,
  forwardMessage,
  myId,
  type Conversation,
  type GroupSummary,
  type PublicProfile,
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
  const [directoryUsers, setDirectoryUsers] = useState<PublicProfile[]>([]);
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, ForwardTarget>>(new Map());
  const [loading, setLoading] = useState(false);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelected(new Map());
      setSearch("");
      setSearchResults([]);
      return;
    }

    let active = true;
    setLoading(true);

    void (async () => {
      try {
        const me = currentUserId || (await myId());
        if (!me) return;
        const [convs, grps, dirUsers] = await Promise.all([
          listConversations(me).catch(() => []),
          listMyGroups(me).catch(() => []),
          listDirectoryUsers(60).catch(() => []),
        ]);
        if (active) {
          setConversations(convs);
          setGroups(grps);
          setDirectoryUsers(dirUsers);
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

  // Scalable remote search debounced
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    const q = search.trim();
    if (!q) {
      setSearchResults([]);
      setSearchingRemote(false);
      return;
    }

    setSearchingRemote(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchPeople(q);
        setSearchResults(results);
      } catch (err) {
        console.error("Failed remote search in ForwardModal:", err);
      } finally {
        setSearchingRemote(false);
      }
    }, 220);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search]);

  const targets = useMemo<ForwardTarget[]>(() => {
    const map = new Map<string, ForwardTarget>();

    // 1. Add Groups
    for (const g of groups) {
      map.set(`group:${g.id}`, {
        type: "group",
        id: g.id,
        name: g.name,
        avatarUrl: g.avatar_url,
      });
    }

    // 2. Add Direct Conversations
    for (const c of conversations) {
      map.set(`user:${c.partner.id}`, {
        type: "user",
        id: c.partner.id,
        name: c.partner.username,
        avatarUrl: c.partner.avatar_url,
      });
    }

    // 3. Add Directory Users
    for (const u of directoryUsers) {
      const key = `user:${u.id}`;
      if (!map.has(key)) {
        map.set(key, {
          type: "user",
          id: u.id,
          name: u.username,
          avatarUrl: u.avatar_url,
        });
      }
    }

    // 4. Add Live Search Results
    for (const s of searchResults) {
      const key = `user:${s.id}`;
      if (!map.has(key)) {
        map.set(key, {
          type: "user",
          id: s.id,
          name: s.username,
          avatarUrl: s.avatar_url,
        });
      }
    }

    const all = Array.from(map.values());
    if (!search.trim()) return all;

    const query = search.trim().toLowerCase();
    return all.filter((t) => t.name.toLowerCase().includes(query));
  }, [conversations, groups, directoryUsers, searchResults, search]);

  const toggleSelect = (target: ForwardTarget) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const key = `${target.type}:${target.id}`;
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, target);
      }
      return next;
    });
  };

  const handleForward = async () => {
    if (!message) return;
    if (selected.size === 0) {
      toast.error("Please select at least one contact or group");
      return;
    }

    setSubmitting(true);
    try {
      const me = currentUserId || (await myId());
      if (!me) throw new Error("User not authenticated");

      const targetList = Array.from(selected.values()).map((t) => ({
        type: t.type,
        id: t.id,
      }));

      await forwardMessage(me, targetList, message);
      toast.success(
        `Forwarded to ${selected.size} ${selected.size === 1 ? "chat" : "chats"}`
      );
      onClose();
    } catch (err: any) {
      console.error("Forward failed:", err);
      toast.error(err?.message || "Failed to forward message");
    } finally {
      setSubmitting(false);
    }
  };

  const renderMessagePreview = () => {
    if (!message) return null;

    return (
      <div className="mx-1 my-2 p-2.5 rounded-xl bg-muted/60 border border-border/50 text-xs flex items-center gap-2.5">
        <Forward className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 truncate">
          {message.attachment ? (
            <div className="flex items-center gap-1.5 font-medium">
              {message.attachment.type.startsWith("image/") && <ImageIcon className="h-3.5 w-3.5 text-blue-500" />}
              {message.attachment.type.startsWith("video/") && <VideoIcon className="h-3.5 w-3.5 text-purple-500" />}
              {message.attachment.type.startsWith("audio/") && <Music className="h-3.5 w-3.5 text-emerald-500" />}
              {!message.attachment.type.startsWith("image/") &&
                !message.attachment.type.startsWith("video/") &&
                !message.attachment.type.startsWith("audio/") && <FileText className="h-3.5 w-3.5 text-amber-500" />}
              <span className="truncate">{message.attachment.name || "Media"}</span>
              {message.body && <span className="opacity-70 truncate font-normal">• {message.body}</span>}
            </div>
          ) : (
            <span className="truncate font-medium text-foreground">{message.body}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-w-md w-[92vw] max-h-[85vh] flex flex-col p-4 sm:p-6 rounded-2xl bg-card border-border/60 shadow-xl overflow-hidden">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Forward className="h-5 w-5 text-primary" />
            <span>Forward Message</span>
          </DialogTitle>
          {renderMessagePreview()}
        </DialogHeader>

        {/* Scalable Search Bar */}
        <div className="relative my-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts or groups..."
            className="pl-9 pr-9 h-10 rounded-xl bg-secondary/50 border-border/50 focus-visible:ring-primary text-sm"
          />
          {searchingRemote && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          )}
        </div>

        {/* Selected count pill */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground font-medium">
            <span>{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setSelected(new Map())}
              className="text-primary hover:underline text-xs"
            >
              Clear
            </button>
          </div>
        )}

        {/* Scalable Contacts and Groups List */}
        <div className="flex-1 overflow-y-auto space-y-1 my-2 pr-1 min-h-[220px] max-h-[380px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <span className="text-xs">Loading contacts...</span>
            </div>
          ) : targets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground px-4">
              <Users className="h-8 w-8 stroke-[1.5] opacity-50 mb-2" />
              <p className="text-sm font-medium">No contacts found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {search.trim() ? "Try another search term" : "No other users or groups available yet"}
              </p>
            </div>
          ) : (
            targets.map((t) => {
              const key = `${t.type}:${t.id}`;
              const isSelected = selected.has(key);
              return (
                <div
                  key={key}
                  onClick={() => toggleSelect(t)}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors select-none",
                    isSelected
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-secondary/70 border border-transparent"
                  )}
                >
                  <div className="relative shrink-0">
                    {t.avatarUrl ? (
                      <img
                        src={t.avatarUrl}
                        alt={t.name}
                        className="h-10 w-10 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center border border-border text-foreground font-semibold text-xs">
                        {t.type === "group" ? (
                          <Users className="h-4 w-4 text-primary" />
                        ) : (
                          t.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                    )}
                    {t.type === "group" && (
                      <span className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground text-[9px] font-bold px-1 rounded-full">
                        G
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      {t.type === "group" ? (
                        <>
                          <Users className="h-3 w-3" />
                          <span>Group</span>
                        </>
                      ) : (
                        <>
                          <MessageSquare className="h-3 w-3" />
                          <span>Direct contact</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div
                    className={cn(
                      "h-5 w-5 rounded-full flex items-center justify-center border transition-all shrink-0",
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="pt-2 sm:pt-4 border-t border-border/50 gap-2 flex-row justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleForward}
            disabled={selected.size === 0 || submitting}
            className="rounded-xl text-xs h-9 px-4 gap-1.5 font-medium"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Forwarding...</span>
              </>
            ) : (
              <>
                <Forward className="h-3.5 w-3.5" />
                <span>Forward {selected.size > 0 && `(${selected.size})`}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}