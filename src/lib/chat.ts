import { supabase } from "@/integrations/supabase/client";
import { getLocalContacts, getLocalMessages, getRelayOutbox, listLocalConversations, removeRelayOutbox, saveLocalContact, saveLocalMessage, saveRelayOutbox, updateLocalMessageStatus, type LocalMessage, type RelayOutboxItem } from "./storage";

export type PublicProfile = { id: string; username: string; avatar_url: string | null };
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
export type Attachment = { url: string; type: "image" | "video" | "pdf" | "audio"; name: string };
export type Conversation = { partner: PublicProfile; last: Message; unread: number };

export const MESSAGE_MAX = 4000;
const COLS = "*";
type RelayMessage = Message & { relay_kind: "message" | "edit" | "delete" | "delivered" | "read"; target_id: string | null };

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

export async function myId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function searchPeople(q: string): Promise<PublicProfile[]> {
  if (!q.trim()) return [];
  const { data, error } = await supabase.rpc("search_profiles", { q });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicProfile[];
}

export async function getProfile(id: string): Promise<PublicProfile | null> {
  const me = await myId();
  const cached = me ? (await getLocalContacts(me)).find((p) => p.id === id) : undefined;
  const { data, error } = await supabase.from("profiles").select("id, username, avatar_url").eq("id", id).maybeSingle();
  if (error || !data) return cached ?? null;
  if (me) await saveLocalContact(me, data);
  return data;
}

export async function listConversations(me: string): Promise<Conversation[]> {
  const locals = await listLocalConversations(me);
  const contacts = new Map((await getLocalContacts(me)).map((p) => [p.id, p]));
  if (locals.length) {
    const { data } = await supabase.from("profiles").select("id, username, avatar_url").in("id", locals.map((c) => c.partnerId));
    for (const profile of data ?? []) {
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

async function enqueueControl(me: string, recipient: string, kind: "edit" | "delete" | "read", target: string, body = "") {
  await saveRelayOutbox({ id: crypto.randomUUID(), sender_id: me, recipient_id: recipient, body, relay_kind: kind, target_id: target, created_at: new Date().toISOString() });
}

// Consume only after the IndexedDB transaction commits. A failed local write leaves the queue intact.
export async function consumeRelay(me: string, item: RelayMessage): Promise<void> {
  if (item.recipient_id !== me) return;
  if (item.relay_kind === "message") {
    const { relay_kind: _kind, target_id: _target, ...message } = item;
    await saveLocalMessage(me, { ...message, local_status: "delivered" });
  } else if (item.target_id) {
    const original = (await getLocalMessages(me)).find((m) => m.id === item.target_id);
    if (original && original.sender_id === item.sender_id && original.recipient_id === me) {
      if (item.relay_kind === "edit") await updateLocalMessageStatus(me, original.id, { body: item.body, edited_at: item.created_at });
      if (item.relay_kind === "delete") await updateLocalMessageStatus(me, original.id, { body: "", deleted_at: item.created_at, attachment_url: null, attachment_type: null, attachment_name: null });
    } else if (original && original.sender_id === me && original.recipient_id === item.sender_id) {
      if (item.relay_kind === "delivered") await updateLocalMessageStatus(me, original.id, { local_status: "delivered" });
      if (item.relay_kind === "read") await updateLocalMessageStatus(me, original.id, { local_status: "read", read_at: item.created_at });
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
    // Import this account's legacy sent history before recipients consume it.
    const { data: legacy, error: legacyError } = await supabase.from("messages").select(COLS).eq("sender_id", me).eq("relay_kind", "message").order("created_at", { ascending: true });
    if (legacyError) throw new Error(legacyError.message);
    for (const item of (legacy ?? []) as RelayMessage[]) {
      const { relay_kind: _kind, target_id: _target, ...message } = item;
      await saveLocalMessage(me, { ...message, local_status: "sent" });
    }
    // Drain in order, including control events. Polling also covers realtime disconnects.
    for (;;) {
      const { data, error } = await supabase.from("messages").select(COLS).eq("recipient_id", me).order("created_at", { ascending: true }).limit(100);
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
  const sync = () => { if (!stopped) void syncRelay(me).catch(() => {}); };
  const channel = supabase.channel(`relay-${me}-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${me}` }, sync)
    .subscribe((status) => { if (status === "SUBSCRIBED") sync(); });
  const timer = window.setInterval(sync, 3000);
  window.addEventListener("online", sync);
  window.addEventListener("focus", sync);
  sync();
  return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("online", sync); window.removeEventListener("focus", sync); void supabase.removeChannel(channel); };
}

export async function sendMessage(me: string, to: string, body: string, replyTo: string | null = null, att: Attachment | null = null): Promise<Message> {
  const text = body.trim();
  if (!text && !att) throw new Error("Message is empty.");
  if (text.length > MESSAGE_MAX) throw new Error(`Message is too long (max ${MESSAGE_MAX}).`);
  if (me === to) throw new Error("Choose another contact.");
  const message: LocalMessage = { id: crypto.randomUUID(), sender_id: me, recipient_id: to, body: text, created_at: new Date().toISOString(), read_at: null, edited_at: null, deleted_at: null, recipient_hidden: false, reply_to_id: replyTo, attachment_url: att?.url ?? null, attachment_type: att?.type ?? null, attachment_name: att?.name ?? null, local_status: "queued" };
  // Persist the retry envelope first; no network send is possible before history commits.
  const item: RelayOutboxItem = { id: message.id, sender_id: me, recipient_id: to, body: text, created_at: message.created_at, relay_kind: "message", target_id: null, reply_to_id: replyTo, attachment_url: message.attachment_url, attachment_type: message.attachment_type, attachment_name: message.attachment_name };
  await saveRelayOutbox(item);
  try { await saveLocalMessage(me, message); }
  catch (error) { await removeRelayOutbox(me, item.id); throw error; }
  void syncRelay(me).catch(() => {});
  return message;
}

export async function markRead(me: string, other: string) {
  for (const message of await getLocalMessages(me, other)) {
    if (message.recipient_id !== me || message.read_at || message.recipient_hidden || message.deleted_at) continue;
    await enqueueControl(me, other, "read", message.id);
    await updateLocalMessageStatus(me, message.id, { read_at: new Date().toISOString(), local_status: "read" });
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
  if (!message || message.sender_id !== me || message.deleted_at) throw new Error("This message cannot be edited.");
  await enqueueControl(me, message.recipient_id, "edit", id, text);
  const updated = await updateLocalMessageStatus(me, id, { body: text, edited_at: new Date().toISOString() });
  if (!updated) throw new Error("Message not found.");
  void syncRelay(me).catch(() => {});
  return updated;
}

export async function deleteMessage(message: Message, me: string) {
  if (message.sender_id === me) {
    await enqueueControl(me, message.recipient_id, "delete", message.id);
    await updateLocalMessageStatus(me, message.id, { body: "", deleted_at: new Date().toISOString(), attachment_url: null, attachment_type: null, attachment_name: null });
    void syncRelay(me).catch(() => {});
  } else if (message.recipient_id === me) {
    await updateLocalMessageStatus(me, message.id, { recipient_hidden: true });
  } else throw new Error("This message does not belong to you.");
}
