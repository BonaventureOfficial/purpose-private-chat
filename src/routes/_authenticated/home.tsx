import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Palette, Search, Users, Plus, Check, Loader2, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, useBackground } from "@/components/purpose/AppShell";
import { Logo } from "@/components/purpose/Logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BACKGROUNDS } from "@/lib/purpose";
import {
  listConversations,
  listMyGroups,
  createGroup,
  myId,
  searchPeople,
  type Conversation,
  type GroupSummary,
  type PublicProfile,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
        <img src={p.avatar_url} alt={p.username} className="h-14 w-14 rounded-full object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
          {p.username[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

function GroupAvatar({ g }: { g: { name: string; avatar_url?: string | null } }) {
  return (
    <div className="relative shrink-0">
      {g.avatar_url ? (
        <img src={g.avatar_url} alt={g.name} className="h-14 w-14 rounded-full object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
          <Users className="h-6 w-6" />
        </div>
      )}
    </div>
  );
}

function HomePage() {
  const [bg, setBg] = useBackground();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chats" | "groups">("chats");
  const [q, setQ] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [convos, setConvos] = useState<Conversation[] | null>(null);
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [people, setPeople] = useState<PublicProfile[]>([]);
  
  // Group creation modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [candidatePeople, setCandidatePeople] = useState<PublicProfile[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    let owner: string | null = null;
    let refreshing = false;
    const refresh = async () => {
      if (!owner || !active || refreshing) return;
      refreshing = true;
      try {
        const [conversations, myGroups] = await Promise.all([
          listConversations(owner),
          listMyGroups(owner),
        ]);
        if (active) {
          setConvos(conversations);
          setGroups(myGroups);
        }
      } finally {
        refreshing = false;
      }
    };
    const onChange = () => {
      void refresh().catch(() => {});
    };
    void myId()
      .then(async (id) => {
        owner = id;
        if (!active) return;
        setMe(id);
        if (id) await refresh();
      })
      .catch(() => {
        setConvos([]);
        setGroups([]);
      });
    window.addEventListener("purpose-vault-change", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      active = false;
      window.removeEventListener("purpose-vault-change", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void searchPeople(q).then(setPeople).catch(() => setPeople([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!createOpen) return;
    const t = setTimeout(() => {
      void searchPeople(groupSearchQuery).then(setCandidatePeople).catch(() => setCandidatePeople([]));
    }, 250);
    return () => clearTimeout(t);
  }, [groupSearchQuery, createOpen]);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one contact to join the group");
      return;
    }
    setCreating(true);
    try {
      const newGroupId = await createGroup(groupName.trim(), selectedMembers);
      toast.success("Group created successfully!");
      setCreateOpen(false);
      setGroupName("");
      setSelectedMembers([]);
      // Refresh groups list
      if (me) {
        const myGroups = await listMyGroups(me);
        setGroups(myGroups);
      }
      // Navigate to the newly created group
      await navigate({ to: `/group/${newGroupId}` as any });
    } catch (err: any) {
      toast.error(err?.message || "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  const toggleSelectMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const filtered = (convos ?? []).filter((c) =>
    c.partner.username.toLowerCase().includes(q.trim().toLowerCase())
  );
  const known = new Set(filtered.map((c) => c.partner.id));
  const newPeople = people.filter((p) => !known.has(p.id));

  const filteredGroups = (groups ?? []).filter((g) =>
    g.name.toLowerCase().includes(q.trim().toLowerCase())
  );

  const header = (
    <div className="mx-auto max-w-2xl px-4 pb-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="h-9 w-9" />
          <span className="text-lg font-bold text-foreground">Purpose</span>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="New Group"
                title="Create New Group"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary hover:opacity-80"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">New Group</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Group Name</label>
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g. Project Team, Family..."
                    className="mt-1.5 rounded-xl"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Add Members ({selectedMembers.length} selected)
                  </label>
                  <Input
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    placeholder="Search people to add..."
                    className="mt-1.5 rounded-xl text-sm"
                  />
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                    {candidatePeople.map((p) => {
                      const isSelected = selectedMembers.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => toggleSelectMember(p.id)}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors",
                            isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-secondary/60"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                              {p.username[0]?.toUpperCase()}
                            </div>
                            <span className="text-sm font-medium">{p.username}</span>
                          </div>
                          <div
                            className={cn(
                              "h-5 w-5 rounded-full flex items-center justify-center border",
                              isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                        </div>
                      );
                    })}
                    {candidatePeople.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        {groupSearchQuery ? "No contacts found" : "Type a username above to find members"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateGroup}
                  disabled={creating || !groupName.trim() || selectedMembers.length === 0}
                  className="w-full rounded-xl"
                >
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Create Group"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(!open)}
              aria-label="Background color"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary hover:opacity-80"
            >
              <Palette className="h-5 w-5" />
            </Button>
            {open && (
              <div className="absolute right-0 top-12 z-20 grid w-56 grid-cols-5 gap-2 rounded-2xl bg-popover p-3 shadow-[var(--shadow-soft)] ring-1 ring-border">
                {BACKGROUNDS.map((b) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    key={b.name}
                    title={b.name}
                    onClick={() => {
                      setBg(b.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "h-8 w-8 rounded-full ring-1 ring-border",
                      bg === b.value && "ring-2 ring-primary"
                    )}
                    style={{ backgroundColor: b.value }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === "chats" ? "Search chats or find people..." : "Search groups..."}
          className="w-full rounded-full border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="mt-3 flex gap-2 border-b border-border/40 pb-1">
        <button
          onClick={() => setTab("chats")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors",
            tab === "chats"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Chats
        </button>
        <button
          onClick={() => setTab("groups")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors",
            tab === "groups"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="h-4 w-4" />
          Groups
          {groups && groups.some((g) => g.unread > 0) && (
            <span className="h-2 w-2 rounded-full bg-primary" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <AppShell header={header} bg={bg}>
      {tab === "chats" ? (
        <ul className="mx-auto max-w-2xl px-2 py-2">
          {filtered.map((c) => (
            <li key={c.partner.id}>
              <Link
                to="/chat/$userId"
                params={{ userId: c.partner.id }}
                className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-foreground/5 transition-colors"
              >
                <Avatar p={c.partner} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">
                    {c.partner.username}
                  </p>
                  <p
                    className={cn(
                      "truncate text-sm",
                      c.unread ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {c.last.deleted_at ? (
                      <em>Message deleted</em>
                    ) : (
                      <>
                        {c.last.sender_id === me ? "You: " : ""}
                        {c.last.body || (c.last.attachment_type ? `[${c.last.attachment_type}]` : "")}
                      </>
                    )}
                  </p>
                </div>
                {c.unread > 0 && (
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {c.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
          {newPeople.length > 0 && (
            <li className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              People
            </li>
          )}
          {newPeople.map((p) => (
            <li key={p.id}>
              <Link
                to="/chat/$userId"
                params={{ userId: p.id }}
                className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-foreground/5 transition-colors"
              >
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
      ) : (
        <ul className="mx-auto max-w-2xl px-2 py-2">
          {filteredGroups.map((g) => (
            <li key={g.id}>
              <Link
                to={`/group/${g.id}` as any}
                className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-foreground/5 transition-colors"
              >
                <GroupAvatar g={g} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-base font-semibold text-foreground">{g.name}</p>
                    {g.role === "admin" && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        Admin
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "truncate text-sm",
                      g.unread ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {g.last ? (
                      g.last.deleted_at ? (
                        <em>Message deleted</em>
                      ) : (
                        <>
                          {g.last.sender_id === me ? "You: " : ""}
                          {g.last.body || (g.last.attachment_type ? `[${g.last.attachment_type}]` : "")}
                        </>
                      )
                    ) : (
                      <span className="italic text-muted-foreground">No messages yet</span>
                    )}
                  </p>
                </div>
                {g.unread > 0 && (
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {g.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
          {groups && filteredGroups.length === 0 && (
            <li className="py-12 text-center text-sm text-muted-foreground space-y-3">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p>
                {q.trim()
                  ? "No groups matching your search."
                  : "No groups yet. Tap the + icon at the top to create your first encrypted group."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(true)}
                className="rounded-xl"
              >
                <Plus className="mr-1.5 h-4 w-4" /> Create Group
              </Button>
            </li>
          )}
        </ul>
      )}
    </AppShell>
  );
}