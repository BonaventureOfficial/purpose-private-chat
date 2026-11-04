import { supabase } from "@/integrations/supabase/client";

export type PublicProfile = { id: string; username: string; avatar_url: string | null };
export type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};
export type Conversation = { partner: PublicProfile; last: Message; unread: number };

export const MESSAGE_MAX = 4000;

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
  const { data } = await supabase.from("profiles").select("id, username, avatar_url").eq("id", id).maybeSingle();
  return data as PublicProfile | null;
}

export async function listConversations(me: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, recipient_id, body, created_at, read_at")
    .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const byPartner = new Map<string, { last: Message; unread: number }>();
  for (const m of (data ?? []) as Message[]) {
    const p = m.sender_id === me ? m.recipient_id : m.sender_id;
    const e = byPartner.get(p) ?? { last: m, unread: 0 };
    if (m.recipient_id === me && !m.read_at) e.unread++;
    byPartner.set(p, e);
  }
  if (byPartner.size === 0) return [];
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", [...byPartner.keys()]);
  const map = new Map((profs ?? []).map((p) => [p.id, p as PublicProfile]));
  return [...byPartner.entries()]
    .filter(([id]) => map.has(id))
    .map(([id, e]) => ({ partner: map.get(id)!, ...e }));
}

export async function loadThread(me: string, other: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, recipient_id, body, created_at, read_at")
    .or(`and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function sendMessage(me: string, to: string, body: string): Promise<Message> {
  const text = body.trim();
  if (!text) throw new Error("Message is empty.");
  if (text.length > MESSAGE_MAX) throw new Error(`Message is too long (max ${MESSAGE_MAX}).`);
  const { data, error } = await supabase
    .from("messages")
    .insert({ sender_id: me, recipient_id: to, body: text })
    .select("id, sender_id, recipient_id, body, created_at, read_at")
    .single();
  if (error) throw new Error(error.message);
  return data as Message;
}

export async function markRead(me: string, other: string) {
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", me)
    .eq("sender_id", other)
    .is("read_at", null);
}
