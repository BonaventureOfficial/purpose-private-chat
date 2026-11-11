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
  local_status?: "queued" | "sent" | "delivered" | "read";
};

export type Attachment = {
  url: string;
  type: "image" | "video" | "pdf" | "audio";
  name: string;
};

export type Conversation = {
  partner: PublicProfile;
  last: Message;
  unread: number;
};

export const MESSAGE_MAX = 4000;
const COLS = "*";

type RelayMessage = Message & {
  relay_kind: "message" | "edit" | "delete" | "delivered" | "read";
  target_id: string | null;
};

/** Hidden for this viewer: the recipient deleted it for themselves. */
export function isHiddenFor(m: Message, me: string) {
  return m.recipient_id === me && m.recipient_hidden;
}

/** Grouping label for a message date: Today, Yesterday, weekday (2-6 days), Last week, then month + year. */
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
  const contacts = new Map((await getLocalContacts(me)).map((p) => [p.id, p]));
  if (locals.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, public_key")
      .in("id", locals.map((c) => c.partnerId));
    for (const profile of (data ?? []) as PublicProfile[]) {
      contacts.set(profile.id, profile);
      await saveLocalContact(me, profile);
    }
  }
  return locals.flatMap((c) => {
    const partner = contacts.get(c.partnerId);
    return partner ? [{ partner, last: c.last, unread: c.unread }] : [];
  });
}

export async function loadThread(me: string, other: string): Promise<Message[]> {
  return (await getLocalMessages(me, other)).filter((m) => !isHiddenFor(m, me));
}

async function enqueueControl(
  me: string,
  recipient: string,
  kind: "edit" | "delete" | "read",
  target: string,
  body = ""
) {
  await saveRelayOutbox({
    id: crypto.randomUUID(),
    sender_id: me,
    recipient_id: recipient,
    body,
    relay_kind: kind,
    target_id: target,
    created_at: new Date().toISOString(),
  });
}

// Consume only after the IndexedDB transaction commits. A failed local write leaves the queue intact.
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
            }
          : null,
        reply_to_id: item.reply_to_id,
      };
    }

    const message: LocalMessage = {
      id: item.id,
      sender_id: item.sender_id,
      recipient_id: item.recipient_id,
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
      local_status: "delivered",
    };

    await saveLocalMessage(me, message);
  } else if (item.target_id) {
    const original = (await getLocalMessages(me)).find((m) => m.id === item.target_id);
    if (original && original.sender_id === item.sender_id && original.recipient_id === me) {
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

    // Drain in order, including control events. Polling also covers realtime disconnects.
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
  // Initialize local unextractable E2EE key and publish public key on connect
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

  // Ensure current user's unextractable E2EE keys are active in IndexedDB
  await ensureMyE2EEKeys(me);

  // Retrieve recipient profile to obtain their public encryption key
  const recipient = await getProfile(to);
  if (!recipient?.public_key) {
    throw new Error(
      "This contact has not initialized their end-to-end encryption keys yet. They must log in to Purpose before receiving messages."
    );
  }

  // Encrypt the payload strictly (AES-256-GCM + ECDH P-256 with Ephemeral sender key)
  const encryptedWire = await encryptE2EE(recipient.public_key, {
    text,
    attachment: att
      ? {
          url: att.url,
          type: att.type,
          name: att.name,
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
    local_status: "queued",
  };

  // Persist the retry envelope with encrypted wire body.
  // Sensitive metadata (attachment URL, replyTo) is sealed inside the ciphertext.
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

export async function markRead(me: string, other: string) {
  for (const message of await getLocalMessages(me, other)) {
    if (message.recipient_id !== me || message.read_at || message.recipient_hidden || message.deleted_at)
      continue;
    await enqueueControl(me, other, "read", message.id);
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

  await enqueueControl(me, message.recipient_id, "edit", id, encryptedWire);
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
    await enqueueControl(me, message.recipient_id, "delete", message.id);
    await updateLocalMessageStatus(me, message.id, {
      body: "",
      deleted_at: new Date().toISOString(),
      attachment_url: null,
      attachment_type: null,
      attachment_name: null,
    });
    void syncRelay(me).catch(() => {});
  } else if (message.recipient_id === me) {
    await updateLocalMessageStatus(me, message.id, { recipient_hidden: true });
  } else {
    throw new Error("This message does not belong to you.");
  }
}
