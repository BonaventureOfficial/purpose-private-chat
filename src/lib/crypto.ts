import { supabase } from "@/integrations/supabase/client";

export type EncryptedAttachment = {
  url: string;
  type: "image" | "video" | "pdf" | "audio";
  name: string;
  key?: string | null;
  iv?: string | null;
};

export type EncryptedPayload = {
  text: string;
  attachment?: EncryptedAttachment | null;
  reply_to_id?: string | null;
};

type KeyVaultRecord = {
  userId: string;
  privateKey: CryptoKey;
  publicKeyString: string;
  createdAt: string;
};

const KEY_DB_NAME = "purpose_e2ee_vault";
const KEY_STORE_NAME = "identity_keys";
const LEGACY_STORAGE_PREFIX = "purpose_e2ee_key_v1_";
const E2EE_PREFIX = "e2ee:v1:";

function openKeyVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Secure IndexedDB storage is not available on this device."));
      return;
    }
    const request = indexedDB.open(KEY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other tabs to upgrade cryptographic storage."));
  });
}

async function getKeyRecord(userId: string): Promise<KeyVaultRecord | null> {
  const db = await openKeyVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_NAME, "readonly");
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    const req = tx.objectStore(KEY_STORE_NAME).get(userId);
    req.onsuccess = () => resolve((req.result as KeyVaultRecord) ?? null);
  });
}

async function saveKeyRecord(record: KeyVaultRecord): Promise<void> {
  const db = await openKeyVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_NAME, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(KEY_STORE_NAME).put(record);
  });
}

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
 * Ensures the signed-in user has an unextractable ECDH P-256 private key
 * securely stored inside IndexedDB (never in plaintext in localStorage).
 * Safely migrates any legacy localStorage keys if present.
 */
export async function ensureMyE2EEKeys(userId: string): Promise<string> {
  let record = await getKeyRecord(userId);

  if (!record) {
    const legacyRaw = localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${userId}`);
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw);
        if (legacy.privateKeyJwk && legacy.publicKeyString) {
          const importedPriv = await window.crypto.subtle.importKey(
            "jwk",
            legacy.privateKeyJwk,
            { name: "ECDH", namedCurve: "P-256" },
            false,
            ["deriveKey"]
          );
          record = {
            userId,
            privateKey: importedPriv,
            publicKeyString: legacy.publicKeyString,
            createdAt: new Date().toISOString(),
          };
          await saveKeyRecord(record);
          localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}${userId}`);
        }
      } catch (err) {
        console.warn("Legacy key migration failed, generating fresh hardware key:", err);
      }
    }
  }

  if (!record) {
    const pair = await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveKey"]
    );
    const pubJwk = await window.crypto.subtle.exportKey("jwk", pair.publicKey);
    const publicKeyString = JSON.stringify({
      kty: pubJwk.kty,
      crv: pubJwk.crv,
      x: pubJwk.x,
      y: pubJwk.y,
    });

    record = {
      userId,
      privateKey: pair.privateKey,
      publicKeyString,
      createdAt: new Date().toISOString(),
    };
    await saveKeyRecord(record);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("public_key")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.public_key !== record.publicKeyString) {
    await supabase
      .from("profiles")
      .update({ public_key: record.publicKeyString })
      .eq("id", userId);
  }

  return record.publicKeyString;
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
 * Decrypts a wire payload using the signed-in user's unextractable IndexedDB private key.
 */
export async function decryptE2EE(
  userId: string,
  wire: string
): Promise<EncryptedPayload> {
  if (!isE2EE(wire)) {
    throw new Error("Message is not end-to-end encrypted.");
  }

  const record = await getKeyRecord(userId);
  if (!record || !record.privateKey) {
    throw new Error("Local private encryption key not found in secure vault.");
  }

  const envelopeJson = base64ToUtf8(wire.slice(E2EE_PREFIX.length));
  const envelope = JSON.parse(envelopeJson);

  const ephemeralPubKey = await window.crypto.subtle.importKey(
    "jwk",
    envelope.epk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: ephemeralPubKey },
    record.privateKey,
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

export function isE2EE(body: string): boolean {
  return typeof body === "string" && body.startsWith(E2EE_PREFIX);
}

/**
 * Encrypts an attachment file client-side using AES-256-GCM before uploading to Cloudflare R2.
 * Generates an independent symmetric key and 12-byte IV for this specific file.
 */
export async function encryptAttachment(file: File): Promise<{
  encryptedFile: File;
  key: string;
  iv: string;
}> {
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const plaintextBuffer = await file.arrayBuffer();
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintextBuffer
  );

  const encryptedFile = new File([ciphertextBuffer], file.name, {
    type: file.type || "application/octet-stream",
  });

  return {
    encryptedFile,
    key: bytesToBase64(new Uint8Array(rawKey)),
    iv: bytesToBase64(iv),
  };
}

/**
 * Decrypts an attachment from raw ciphertext ArrayBuffer using AES-256-GCM.
 */
export async function decryptAttachment(
  ciphertext: ArrayBuffer,
  keyB64: string,
  ivB64: string,
  mimeType = "application/octet-stream"
): Promise<Blob> {
  const keyBytes = base64ToBytes(keyB64);
  const ivBytes = base64ToBytes(ivB64);

  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const plaintextBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    aesKey,
    ciphertext
  );

  return new Blob([plaintextBuffer], { type: mimeType });
}

const decryptedMediaCache = new Map<string, string>();

export function getCachedDecryptedMedia(url: string): string | undefined {
  return decryptedMediaCache.get(url);
}

export function cacheDecryptedMedia(url: string, blobUrl: string): void {
  decryptedMediaCache.set(url, blobUrl);
}

/**
 * Downloads an encrypted media file from Cloudflare R2 and decrypts it with AES-256-GCM.
 */
export async function downloadAndDecryptMedia(
  url: string,
  keyB64: string,
  ivB64: string,
  mimeType = "application/octet-stream"
): Promise<string> {
  const cached = decryptedMediaCache.get(url);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download media (${res.status})`);
  }

  const ciphertext = await res.arrayBuffer();
  const decryptedBlob = await decryptAttachment(ciphertext, keyB64, ivB64, mimeType);
  const blobUrl = URL.createObjectURL(decryptedBlob);
  decryptedMediaCache.set(url, blobUrl);
  return blobUrl;
}

export async function computeSafetyNumber(
  myUserId: string,
  otherUserId: string,
  myPubKey: string,
  otherPubKey: string
): Promise<string> {
  const [first, second] = myUserId < otherUserId ? [myPubKey, otherPubKey] : [otherPubKey, myPubKey];
  const data = new TextEncoder().encode(`${first}|${second}`);
  const hash = await window.crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let numStr = "";
  for (let i = 0; i < 12; i++) {
    const segment = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
    numStr += segment.toString().padStart(5, "0").slice(-5);
    if (i < 11 && (i + 1) % 2 === 0) numStr += " ";
  }
  return numStr;
}
