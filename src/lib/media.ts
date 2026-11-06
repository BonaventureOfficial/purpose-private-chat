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

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 60;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PDF_MAX_BYTES = 20 * 1024 * 1024;

export type FileKind = "image" | "video" | "pdf" | "audio";
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav"];
const AUDIO_MAX_BYTES = 20 * 1024 * 1024;

/** Pure rule check: returns the kind or a user-facing error. */
export function checkFile(type: string, size: number, durationSec?: number): { kind: FileKind } | { error: string } {
  if (IMAGE_TYPES.includes(type)) return size > IMAGE_MAX_BYTES ? { error: "This image is too large (max 10 MB)." } : { kind: "image" };
  if (type === "application/pdf") return size > PDF_MAX_BYTES ? { error: "This PDF is too large (max 20 MB)." } : { kind: "pdf" };
  if (AUDIO_TYPES.includes(type.split(";")[0]!)) return size > AUDIO_MAX_BYTES ? { error: "This recording is too large." } : { kind: "audio" };
  if (VIDEO_TYPES.includes(type)) {
    if (size > VIDEO_MAX_BYTES) return { error: "This video is too large (max 20 MB)." };
    if (durationSec !== undefined && durationSec > VIDEO_MAX_SECONDS + 0.5) return { error: "This video is too long (max 1 minute)." };
    return { kind: "video" };
  }
  return { error: "Unsupported file. Send a JPG, PNG, WEBP, GIF, MP4, WEBM, MOV or PDF." };
}

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This video could not be read.")); };
    v.src = url;
  });
}

export async function validateFile(file: File): Promise<FileKind> {
  let r = checkFile(file.type, file.size);
  if ("kind" in r && r.kind === "video") r = checkFile(file.type, file.size, await videoDuration(file));
  if ("error" in r) throw new Error(r.error);
  return r.kind;
}
