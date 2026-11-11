import { supabase } from "@/integrations/supabase/client";

export type EncryptedPayload = {
  text: string;
  attachment?: {
    url: string;
    type: "image" | "video" | "pdf" | "audio";
    name: string;
  } | null;
  reply_to_id?: string | null;
};

type StoredKeyPair = {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  publicKeyString: string;
};

const KEY_STORAGE_PREFIX = "purpose_e2ee_key_v1_";
const E2EE_PREFIX = "e2ee:v1:";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64(bytes);
}

function base64ToUtf8(b64: string): string {
  const bytes = base64ToBytes(b64);
  return new TextDecoder().decode(bytes);
}

/**
 * Ensures the signed-in user has an ECDH P-256 key pair stored locally
 * and that their public key is published to their Supabase profile.
 */
export async function ensureMyE2EEKeys(userId: string): Promise<string> {
  const storageKey = `${KEY_STORAGE_PREFIX}${userId}`;
  let keyData: StoredKeyPair | null = null;

  const raw = localStorage.getItem(storageKey);
  if (raw) {
    try {
      keyData = JSON.parse(raw);
    } catch {
      keyData = null;
    }
  }

  if (!keyData || !keyData.privateKeyJwk || !keyData.publicKeyString) {
    const pair = await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey"]
    );
    const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", pair.privateKey);
    const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", pair.publicKey);
    const publicKeyString = JSON.stringify({
      kty: publicKeyJwk.kty,
      crv: publicKeyJwk.crv,
      x: publicKeyJwk.x,
      y: publicKeyJwk.y,
    });

    keyData = { privateKeyJwk, publicKeyJwk, publicKeyString };
    localStorage.setItem(storageKey, JSON.stringify(keyData));
  }

  // Publish / sync public key to Supabase profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("public_key")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.public_key !== keyData.publicKeyString) {
    await supabase
      .from("profiles")
      .update({ public_key: keyData.publicKeyString })
      .eq("id", userId);
  }

  return keyData.publicKeyString;
}

/**
 * Encrypts a payload for a recipient using ECDH P-256 (ephemeral sender key) + AES-256-GCM.
 */
export async function encryptE2EE(
  recipientPublicKeyString: string,
  payload: EncryptedPayload
): Promise<string> {
  let pubJwk: JsonWebKey;
  try {
    pubJwk = JSON.parse(recipientPublicKeyString);
  } catch {
    throw new Error("Invalid recipient encryption public key format.");
  }

  const recipientKey = await window.crypto.subtle.importKey(
    "jwk",
    pubJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Generate a fresh ephemeral key pair for this specific message (PFS for sender)
  const ephemeral = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: recipientKey },
    ephemeral.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintextBytes
  );

  const ephemeralPubJwk = await window.crypto.subtle.exportKey("jwk", ephemeral.publicKey);

  const envelope = {
    epk: {
      kty: ephemeralPubJwk.kty,
      crv: ephemeralPubJwk.crv,
      x: ephemeralPubJwk.x,
      y: ephemeralPubJwk.y,
    },
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ciphertextBuffer)),
  };

  return `${E2EE_PREFIX}${utf8ToBase64(JSON.stringify(envelope))}`;
}

/**
 * Decrypts a wire payload using the signed-in user's private key.
 */
export async function decryptE2EE(
  userId: string,
  wire: string
): Promise<EncryptedPayload> {
  if (!isE2EE(wire)) {
    throw new Error("Message is not end-to-end encrypted.");
  }

  const storageKey = `${KEY_STORAGE_PREFIX}${userId}`;
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    throw new Error("Local private encryption key not found on this device.");
  }

  const keyData: StoredKeyPair = JSON.parse(raw);
  const envelopeJson = base64ToUtf8(wire.slice(E2EE_PREFIX.length));
  const envelope = JSON.parse(envelopeJson);

  const recipientPrivateKey = await window.crypto.subtle.importKey(
    "jwk",
    keyData.privateKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"]
  );

  const ephemeralPubKey = await window.crypto.subtle.importKey(
    "jwk",
    envelope.epk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: ephemeralPubKey },
    recipientPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    aesKey,
    base64ToBytes(envelope.ct)
  );

  const decryptedText = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(decryptedText) as EncryptedPayload;
}

/**
 * Checks whether a wire message body is an E2EE envelope.
 */
export function isE2EE(body: string): boolean {
  return typeof body === "string" && body.startsWith(E2EE_PREFIX);
}
