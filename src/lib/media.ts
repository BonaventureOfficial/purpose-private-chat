import { supabase } from "@/integrations/supabase/client";

// Cloudflare Worker that stores and serves all Purpose files (R2).
export const MEDIA_GATEWAY = "https://purpose-api.tuyisengebonaventure29.workers.dev";

export async function uploadMedia(file: File, kind: "avatar" | "media" = "media"): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${MEDIA_GATEWAY}/upload/${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { url: string };
  return body.url;
}

export async function uploadAvatar(file: File): Promise<string> {
  const url = await uploadMedia(file, "avatar");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("You must be signed in.");
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", u.user.id);
  if (error) throw new Error(error.message);
  return url;
}

export async function getMyProfile() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase.from("profiles").select("username, avatar_url").eq("id", u.user.id).maybeSingle();
  return data;
}
