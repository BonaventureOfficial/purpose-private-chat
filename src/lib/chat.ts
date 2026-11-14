import { supabase } from "@/integrations/supabase/client";
import {
  getLocalContacts,
  getLocalMessages,
  getRelayOutbox,
  listLocalConversations,
  removeRelayOutbox,
  saveLocalContact,
  saveLocalMessage,
  saveRelayOutbox,
  updateLocalMessageStatus,
  saveLocalGroup,
  getLocalGroups,
  getLocalGroup,
  deleteLocalGroup,
  type LocalGroup,
  type LocalMessage,
  type RelayOutboxItem,
} from "./storage";
import {
  decryptE2EE,
  encryptE2EE,
  ensureMyE2EEKeys,
  isE2EE,
  type EncryptedPayload,
} from "./crypto";

export type PublicProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  public_key?: string | null;
};

export type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  group_id?: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  recipient_hidden: boolean;
  reply_to_id: string | null;
  attachment_url: string | null;
  attachment_type: "image" | "video" | "pdf" | "audio" | null;
  attachment_name: string | null;
  attachment_key?: string | null;
  attachment_iv?: string | null;
  local_status?: "queued" | "sent" | "delivered" | "read";
};

export type Attachment = {
  url: string;
  type: "image" | "video" | "pdf" | "audio";
  name: string;
  key?: string | null;
  iv?: string | null;
};

export type Conversation = {
  partner: PublicProfile;
  last: Message;
  unread: number;
};

export type GroupSummary = {
  id: string;
  name: string;
  avatar_url: string | null;
  created_by: string;
  role: "admin" | "member";
  last?: Message | null;
  unread: number;
};

export type GroupMember = {
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
  profile: PublicProfile;
};

export type GroupDetails = {
  id: string;
  name: string;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  members: GroupMember[];
  myRole: "admin" | "member";
};

export const MESSAGE_MAX = 4000;
const COLS = "*";

type RelayMessage = Message & {
  relay_kind: "message" | "edit" | "delete" | "delivered" | "read";
  target_id: string | null;
  group_id?: string | null;
};

export function isHiddenFor(m: Message, me: string) {
  return m.recipient_id === me && m.recipient_hidden;
}

export function dateLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 6) return d.toLocaleDateString([], { weekday: "long" });
  if (days <= 13) return "Last week";
  return d.toLocaleDateString([], { month: "long", year: "numeric" });
}

export async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function searchPeople(q: string): Promise<PublicProfile[]> {
  const term = q.trim();
  if (!term) return [];
  const me = await myId();
  const query = supabase
    .from("profiles")
    .select("id, username, avatar_url, public_key")
    .ilike("username", `${term}%`)
    .limit(20);
  if (me) {
    query.neq("id", me);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicProfile[];
}

export async function getProfile(id: string): Promise<PublicProfile | null> {
  const me = await myId();
  const cached = me ? (await getLocalContacts(me)).find((p) => p.id === id) : undefined;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, public_key")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return cached ?? null;
  if (me) await saveLocalContact(me, data as PublicProfile);
  return data as PublicProfile;
}

export async function listConversations(me: string): Promise<Conversation[]> {
  const locals = await listLocalConversations(me);
  // Exclude group conversations from 1-to-1 chats
  const directLocals = locals.filter((c) => !c.isGroup);
  const contacts = new Map((await getLocalContacts(me)).map((p) => [p.id, p]));
  if (directLocals.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, public_key")
      .in("id", directLocals.map((c) => c.partnerId));
    for (const profile of (data ?? []) as PublicProfile[]) {
      contacts.set(profile.id, profile);
      await saveLocalContact(me, profile);
    }
  }
  return directLocals.flatMap((c) => {
    const partner = contacts.get(c.partnerId);
    return partner ? [{ partner, last: c.last, unread: c.unread }] : [];
  });
}

export async function loadThread(me: string, otherOrGroupId: string): Promise<Message[]> {
  return (await getLocalMessages(me, otherOrGroupId)).filter((m) => !isHiddenFor(m, me));
}

async function enqueueControl(
  me: string,
  recipient: string,
  kind: "edit" | "delete" | "read",
  target: string,
  body = "",
  groupId: string | null = null
) {
  await saveRelayOutbox({
    id: crypto.randomUUID(),
    sender_id: me,
    recipient_id: recipient,
    group_id: groupId,
    body,
    relay_kind: kind,
    target_id: target,
    created_at: new Date().toISOString(),
  });
}

export async function consumeRelay(me: string, item: RelayMessage): Promise<void> {
  if (item.recipient_id !== me) return;

  if (item.relay_kind === "message") {
    let payload: EncryptedPayload;
    if (isE2EE(item.body)) {
      payload = await decryptE2EE(me, item.body);
    } else {
      payload = {
        text: item.body,
        attachment: item.attachment_url
          ? {
              url: item.attachment_url,
              type: item.attachment_type ?? "image",
              name: item.attachment_name ?? "file",
              key: null,
              iv: null,
            }
          : null,
        reply_to_id: item.reply_to_id,
      };
    }

    const canonicalId = (payload as any).message_id || item.target_id || item.id;
    const message: LocalMessage = {
      id: canonicalId,
      sender_id: item.sender_id,
      recipient_id: item.recipient_id,
      group_id: item.group_id ?? null,
      body: payload.text,
      created_at: item.created_at,
      read_at: item.read_at,
      edited_at: item.edited_at,
      deleted_at: item.deleted_at,
      recipient_hidden: false,
      reply_to_id: payload.reply_to_id ?? null,
      attachment_url: payload.attachment?.url ?? null,
      attachment_type: payload.attachment?.type ?? null,
      attachment_name: payload.attachment?.name ?? null,
      attachment_key: payload.attachment?.key ?? null,
      attachment_iv: payload.attachment?.iv ?? null,
      local_status: "delivered",
    };

    await saveLocalMessage(me, message);
  } else if (item.target_id) {
    const original = (await getLocalMessages(me)).find((m) => m.id === item.target_id);
    const isGroupDelete = original && (original.group_id || item.group_id);
    const isDirectSender = original && original.sender_id === item.sender_id && original.recipient_id === me;
    if (original && (isDirectSender || isGroupDelete)) {
      if (item.relay_kind === "edit") {
        let editedText = item.body;
        if (isE2EE(item.body)) {
          try {
            const dec = await decryptE2EE(me, item.body);
            editedText = dec.text;
          } catch (err) {
            console.error("Failed to decrypt edited message:", err);
          }
        }
        await updateLocalMessageStatus(me, original.id, {
          body: editedText,
          edited_at: item.created_at,
        });
      }
      if (item.relay_kind === "delete") {
        await updateLocalMessageStatus(me, original.id, {
          body: "",
          deleted_at: item.created_at,
          attachment_url: null,
          attachment_type: null,
          attachment_name: null,
          attachment_key: null,
          attachment_iv: null,
        });
      }
    } else if (original && original.sender_id === me && original.recipient_id === item.sender_id) {
      if (item.relay_kind === "delivered") {
        await updateLocalMessageStatus(me, original.id, { local_status: "delivered" });
      }
      if (item.relay_kind === "read") {
        await updateLocalMessageStatus(me, original.id, {
          local_status: "read",
          read_at: item.created_at,
        });
      }
    }
  }

  const { error } = await supabase.rpc("acknowledge_relay", { item_id: item.id });
  if (error) throw new Error(error.message);
}

const syncing = new Map<string, Promise<void>>();
export function syncRelay(me: string): Promise<void> {
  const current = syncing.get(me);
  if (current) return current;
  const run = (async () => {
    for (const item of await getRelayOutbox(me)) {
      const { error } = await supabase.from("messages").insert(item);
      if (error && error.code !== "23505") throw new Error(error.message);
      if (item.relay_kind === "message") await updateLocalMessageStatus(me, item.id, { local_status: "sent" });
      await removeRelayOutbox(me, item.id);
    }

    for (;;) {
      const { data, error } = await supabase
        .from("messages")
        .select(COLS)
        .eq("recipient_id", me)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      for (const item of data as RelayMessage[]) await consumeRelay(me, item);
    }
  })();
  syncing.set(me, run);
  void run.finally(() => syncing.delete(me)).catch(() => {});
  return run;
}

export function startRelay(me: string): () => void {
  let stopped = false;
  void ensureMyE2EEKeys(me).catch((err) => console.error("E2EE key init error:", err));

  const sync = () => {
    if (!stopped) void syncRelay(me).catch(() => {});
  };
  const channel = supabase
    .channel(`relay-${me}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${me}` },
      sync
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") sync();
    });
  const timer = window.setInterval(sync, 3000);
  window.addEventListener("online", sync);
  window.addEventListener("focus", sync);
  sync();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("online", sync);
    window.removeEventListener("focus", sync);
    void supabase.removeChannel(channel);
  };
}

export async function sendMessage(
  me: string,
  to: string,
  body: string,
  replyTo: string | null = null,
  att: Attachment | null = null
): Promise<Message> {
  const text = body.trim();
  if (!text && !att) throw new Error("Message is empty.");
  if (text.length > MESSAGE_MAX) throw new Error(`Message is too long (max ${MESSAGE_MAX}).`);
  if (me === to) throw new Error("Choose another contact.");

  await ensureMyE2EEKeys(me);

  const recipient = await getProfile(to);
  if (!recipient?.public_key) {
    throw new Error(
      "This contact has not initialized their end-to-end encryption keys yet. They must log in to Purpose before receiving messages."
    );
  }

  const encryptedWire = await encryptE2EE(recipient.public_key, {
    text,
    attachment: att
      ? {
          url: att.url,
          type: att.type,
          name: att.name,
          key: att.key ?? null,
          iv: att.iv ?? null,
        }
      : null,
    reply_to_id: replyTo,
  });

  const message: LocalMessage = {
    id: crypto.randomUUID(),
    sender_id: me,
    recipient_id: to,
    body: text,
    created_at: new Date().toISOString(),
    read_at: null,
    edited_at: null,
    deleted_at: null,
    recipient_hidden: false,
    reply_to_id: replyTo,
    attachment_url: att?.url ?? null,
    attachment_type: att?.type ?? null,
    attachment_name: att?.name ?? null,
    attachment_key: att?.key ?? null,
    attachment_iv: att?.iv ?? null,
    local_status: "queued",
  };

  const item: RelayOutboxItem = {
    id: message.id,
    sender_id: me,
    recipient_id: to,
    body: encryptedWire,
    created_at: message.created_at,
    relay_kind: "message",
    target_id: null,
    reply_to_id: null,
    attachment_url: null,
    attachment_type: null,
    attachment_name: null,
  };

  await saveRelayOutbox(item);
  try {
    await saveLocalMessage(me, message);
  } catch (error) {
    await removeRelayOutbox(me, item.id);
    throw error;
  }
  void syncRelay(me).catch(() => {});
  return message;
}

export async function markRead(me: string, otherOrGroupId: string) {
  for (const message of await getLocalMessages(me, otherOrGroupId)) {
    if (message.recipient_id !== me || message.read_at || message.recipient_hidden || message.deleted_at)
      continue;
    if (!message.group_id) {
      await enqueueControl(me, otherOrGroupId, "read", message.id);
    }
    await updateLocalMessageStatus(me, message.id, {
      read_at: new Date().toISOString(),
      local_status: "read",
    });
  }
  void syncRelay(me).catch(() => {});
}

export async function editMessage(id: string, body: string): Promise<Message> {
  const text = body.trim();
  if (!text) throw new Error("Message is empty.");
  if (text.length > MESSAGE_MAX) throw new Error(`Message is too long (max ${MESSAGE_MAX}).`);
  const me = await myId();
  if (!me) throw new Error("You must be signed in.");
  const message = (await getLocalMessages(me)).find((m) => m.id === id);
  if (!message || message.sender_id !== me || message.deleted_at) {
    throw new Error("This message cannot be edited.");
  }

  await ensureMyE2EEKeys(me);
  const recipient = await getProfile(message.recipient_id);
  if (!recipient?.public_key) {
    throw new Error("Cannot edit message: recipient encryption key is missing.");
  }

  const encryptedWire = await encryptE2EE(recipient.public_key, {
    text,
    attachment: null,
    reply_to_id: null,
  });

  await enqueueControl(me, message.recipient_id, "edit", id, encryptedWire, message.group_id ?? null);
  const updated = await updateLocalMessageStatus(me, id, {
    body: text,
    edited_at: new Date().toISOString(),
  });
  if (!updated) throw new Error("Message not found.");
  void syncRelay(me).catch(() => {});
  return updated;
}

export async function deleteMessage(message: Message, me: string) {
  if (message.sender_id === me) {
    if (!message.group_id) {
      await enqueueControl(me, message.recipient_id, "delete", message.id);
    }
    await updateLocalMessageStatus(me, message.id, {
      body: "",
      deleted_at: new Date().toISOString(),
      attachment_url: null,
      attachment_type: null,
      attachment_name: null,
      attachment_key: null,
      attachment_iv: null,
    });
    void syncRelay(me).catch(() => {});
  } else if (message.recipient_id === me || message.group_id) {
    await updateLocalMessageStatus(me, message.id, { recipient_hidden: true });
  } else {
    throw new Error("This message does not belong to you.");
  }
}

// ====================================================================
// GROUPS FUNCTIONS (E2EE PAIRWISE BROADCAST & OWNER SUPERPOWERS)
// ====================================================================

export interface GroupMemberWithProfile {
  user_id: string;
  role: "admin" | "member";
  can_send: boolean;
  joined_at: string;
  profile: PublicProfile;
}

export interface GroupDetails {
  id: string;
  name: string;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  only_admins_can_send: boolean;
  members: GroupMemberWithProfile[];
  myRole: "admin" | "member";
  isOwner: boolean;
  canSend: boolean;
}

export async function createGroup(
  name: string,
  memberUserIds: string[],
  avatarUrl?: string | null
): Promise<string> {
  const groupName = name.trim();
  if (!groupName) throw new Error("Group name is required.");
  if (groupName.length > 100) throw new Error("Group name must be 100 characters or fewer.");
  const me = await myId();
  if (!me) throw new Error("You must be signed in to create a group.");

  await ensureMyE2EEKeys(me);

  // 1. Create the group row in Supabase
  const { data: groupData, error: groupError } = await supabase
    .from("groups")
    .insert({
      name: groupName,
      created_by: me,
      avatar_url: avatarUrl ?? null,
      only_admins_can_send: false,
    } as any)
    .select("id")
    .single();

  if (groupError || !groupData) {
    throw new Error(groupError?.message || "Failed to create group.");
  }

  const groupId = groupData.id;

  // 2. Add creator as admin
  const allMembers = Array.from(new Set([me, ...memberUserIds]));
  const memberRows = allMembers.map((userId) => ({
    group_id: groupId,
    user_id: userId,
    role: userId === me ? "admin" : "member",
    can_send: true,
  }));

  const { error: membersError } = await supabase
    .from("group_members")
    .insert(memberRows as any);

  if (membersError) {
    throw new Error(membersError.message);
  }

  // 3. Save group metadata in local IndexedDB
  await saveLocalGroup(me, {
    id: groupId,
    name: groupName,
    avatar_url: avatarUrl ?? null,
    created_by: me,
    created_at: new Date().toISOString(),
    my_role: "admin",
  });

  return groupId;
}

export async function getGroupDetails(groupId: string): Promise<GroupDetails> {
  const me = await myId();
  if (!me) throw new Error("You must be signed in.");

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("id, name, avatar_url, created_by, created_at, only_admins_can_send")
    .eq("id", groupId)
    .single();

  if (groupErr || !group) {
    throw new Error(groupErr?.message || "Group not found.");
  }

  const { data: members, error: membersErr } = await supabase
    .from("group_members")
    .select("user_id, role, can_send, joined_at, profiles(id, username, avatar_url, public_key)")
    .eq("group_id", groupId);

  if (membersErr || !members) {
    throw new Error(membersErr?.message || "Unable to load group members.");
  }

  const formattedMembers: GroupMemberWithProfile[] = members.map((m: any) => ({
    user_id: m.user_id,
    role: (m.role as "admin" | "member") || "member",
    can_send: m.can_send !== false,
    joined_at: m.joined_at,
    profile: {
      id: m.profiles.id,
      username: m.profiles.username,
      avatar_url: m.profiles.avatar_url,
      public_key: m.profiles.public_key,
    },
  }));

  const myMember = formattedMembers.find((m) => m.user_id === me);
  const myRole: "admin" | "member" = myMember?.role || "member";
  const isOwner = group.created_by === me;
  const isMuted = myMember ? myMember.can_send === false : false;
  const onlyAdmins = Boolean((group as any).only_admins_can_send);

  // Owner can always send. Otherwise must not be muted, and if onlyAdmins is active, must be admin.
  const canSend = isOwner || (!isMuted && (!onlyAdmins || myRole === "admin"));

  return {
    id: group.id,
    name: group.name,
    avatar_url: group.avatar_url,
    created_by: group.created_by,
    created_at: group.created_at,
    only_admins_can_send: onlyAdmins,
    members: formattedMembers,
    myRole,
    isOwner,
    canSend,
  };
}

// --------------------------------------------------------------------
// OWNER & ADMIN SUPERPOWERS
// --------------------------------------------------------------------

/**
 * Owner only: Promote a member to Admin or demote back to Member
 */
export async function setMemberRole(
  groupId: string,
  targetUserId: string,
  newRole: "admin" | "member"
): Promise<void> {
  const me = await myId();
  if (!me) throw new Error("You must be signed in.");

  const { error } = await supabase
    .from("group_members")
    .update({ role: newRole } as any)
    .eq("group_id", groupId)
    .eq("user_id", targetUserId);

  if (error) throw new Error(error.message);
}

/**
 * Owner or Admin: Mute a member (ban from sending) or restore sending rights
 */
export async function setMemberCanSend(
  groupId: string,
  targetUserId: string,
  canSend: boolean
): Promise<void> {
  const me = await myId();
  if (!me) throw new Error("You must be signed in.");

  const { error } = await supabase
    .from("group_members")
    .update({ can_send: canSend } as any)
    .eq("group_id", groupId)
    .eq("user_id", targetUserId);

  if (error) throw new Error(error.message);
}

/**
 * Owner only: Toggle restriction to allow only admins to send messages
 */
export async function setGroupOnlyAdminsCanSend(
  groupId: string,
  onlyAdmins: boolean
): Promise<void> {
  const me = await myId();
  if (!me) throw new Error("You must be signed in.");

  const { error } = await supabase
    .from("groups")
    .update({ only_admins_can_send: onlyAdmins } as any)
    .eq("id", groupId);

  if (error) throw new Error(error.message);
}

/**
 * Owner or Admin: Kick a member from the group
 */
export async function kickGroupMember(
  groupId: string,
  targetUserId: string
): Promise<void> {
  const me = await myId();
  if (!me) throw new Error("You must be signed in.");

  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", targetUserId);

  if (error) throw new Error(error.message);
}

/**
 * Delete a group message: permitted for Sender, Group Admins, and Group Owner.
 * Propagates delete tombstone to all members via ephemeral relay.
 */
export async function deleteGroupMessage(
  groupId: string,
  message: Message
): Promise<void> {
  const me = await myId();
  if (!me) throw new Error("You must be signed in.");

  const details = await getGroupDetails(groupId);
  const isMine = message.sender_id === me;
  const isAdminOrOwner = details.isOwner || details.myRole === "admin";

  if (!isMine && !isAdminOrOwner) {
    throw new Error("Only the message sender or group administrators can delete this message.");
  }

  // 1. Mark deleted locally
  await updateLocalMessageStatus(me, message.id, {
    body: "",
    deleted_at: new Date().toISOString(),
    attachment_url: null,
    attachment_type: null,
    attachment_name: null,
    attachment_key: null,
    attachment_iv: null,
  });

  // 2. Broadcast delete control item to all other group members
  const otherMembers = details.members.filter((m) => m.user_id !== me);
  for (const m of otherMembers) {
    await saveRelayOutbox({
      id: crypto.randomUUID(),
      sender_id: me,
      recipient_id: m.user_id,
      group_id: groupId,
      body: "",
      relay_kind: "delete",
      target_id: message.id,
      created_at: new Date().toISOString(),
    });
  }

  void syncRelay(me).catch(() => {});
}

// --------------------------------------------------------------------
// SEND GROUP MESSAGE (E2EE PAIRWISE BROADCAST)
// --------------------------------------------------------------------

export async function sendGroupMessage(
  groupId: string,
  body: string,
  replyTo: string | null = null,
  att: Attachment | null = null
): Promise<Message> {
  const text = body.trim();
  if (!text && !att) throw new Error("Message is empty.");
  if (text.length > MESSAGE_MAX) throw new Error(`Message is too long (max ${MESSAGE_MAX}).`);

  const me = await myId();
  if (!me) throw new Error("You must be signed in.");

  await ensureMyE2EEKeys(me);

  // 1. Fetch group details & verify permissions
  const details = await getGroupDetails(groupId);
  if (!details.canSend) {
    if (details.only_admins_can_send && details.myRole !== "admin" && !details.isOwner) {
      throw new Error("Only administrators are permitted to send messages in this group.");
    }
    throw new Error("You have been restricted from sending messages in this group.");
  }

  const messageId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  // 2. Save local copy immediately in IndexedDB (keyed under groupId)
  const localMessage: LocalMessage = {
    id: messageId,
    sender_id: me,
    recipient_id: me,
    group_id: groupId,
    body: text,
    created_at: createdAt,
    read_at: null,
    edited_at: null,
    deleted_at: null,
    recipient_hidden: false,
    reply_to_id: replyTo,
    attachment_url: att?.url ?? null,
    attachment_type: att?.type ?? null,
    attachment_name: att?.name ?? null,
    attachment_key: att?.key ?? null,
    attachment_iv: att?.iv ?? null,
    local_status: "queued",
  };

  await saveLocalMessage(me, localMessage);

  // 3. Pairwise E2EE broadcast:
  // Tolerance check: if a member does NOT have public_key, skip them without blocking the group!
  const otherMembers = details.members.filter((m) => m.user_id !== me);
  const readyMembers = otherMembers.filter((m) => Boolean(m.profile.public_key));

  const payloadData: EncryptedPayload = {
    text,
    attachment: att
      ? {
          url: att.url,
          type: att.type,
          name: att.name,
          key: att.key ?? null,
          iv: att.iv ?? null,
        }
      : null,
    reply_to_id: replyTo,
    message_id: messageId,
    group_id: groupId,
  };

  for (const m of readyMembers) {
    try {
      const recipientKey = m.profile.public_key!;
      const encryptedWire = await encryptE2EE(recipientKey, payloadData);

      const item: RelayOutboxItem = {
        id: crypto.randomUUID(),
        sender_id: me,
        recipient_id: m.user_id,
        group_id: groupId,
        body: encryptedWire,
        created_at: createdAt,
        relay_kind: "message",
        target_id: messageId,
        reply_to_id: null,
        attachment_url: null,
        attachment_type: null,
        attachment_name: null,
      };

      await saveRelayOutbox(item);
    } catch (err) {
      console.error(`Failed to encrypt for member ${m.profile.username}:`, err);
    }
  }

  await updateLocalMessageStatus(me, messageId, { local_status: "sent" });
  void syncRelay(me).catch(() => {});
  return localMessage;
}

export async function leaveGroup(groupId: string): Promise<void> {
  const me = await myId();
  if (!me) throw new Error("You must be signed in.");

  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", me);

  if (error) throw new Error(error.message);
  await deleteLocalGroup(me, groupId);
}