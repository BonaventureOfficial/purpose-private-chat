import type { Message, PublicProfile } from "./chat";

export type LocalStatus = "queued" | "sent" | "delivered" | "read";
export type LocalMessage = Message & { local_status?: LocalStatus };
type StoredMessage = LocalMessage & { owner_id: string; partner_id: string };
export type LocalConversation = { partnerId: string; last: LocalMessage; unread: number };
export type RelayOutboxItem = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  relay_kind: "message" | "edit" | "delete" | "read";
  target_id: string | null;
  created_at: string;
  reply_to_id?: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
};

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Local message storage is unavailable on this device."));
      return;
    }
    const request = indexedDB.open("purpose_vault", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const messages = db.createObjectStore("messages", { keyPath: ["owner_id", "id"] });
      messages.createIndex("owner", "owner_id");
      messages.createIndex("conversation", ["owner_id", "partner_id"]);
      db.createObjectStore("contacts", { keyPath: ["owner_id", "id"] }).createIndex("owner", "owner_id");
      db.createObjectStore("outbox", { keyPath: ["sender_id", "id"] }).createIndex("owner", "sender_id");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Purpose tabs to update local storage."));
  });
}

async function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, set: (value: T) => void) => void
): Promise<T> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result: T;
    tx.oncomplete = () => {
      db.close();
      if (mode === "readwrite" && storeName === "messages") {
        window.dispatchEvent(new Event("purpose-vault-change"));
      }
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Unable to save messages on this device."));
    };
    try {
      work(tx.objectStore(storeName), (value) => {
        result = value;
      });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

function stripOwner(row: StoredMessage): LocalMessage {
  const { owner_id: _owner, partner_id: _partner, ...message } = row;
  return message;
}

export async function saveLocalMessage(owner: string, message: LocalMessage): Promise<void> {
  if (message.sender_id !== owner && message.recipient_id !== owner) {
    throw new Error("Message does not belong to this account.");
  }
  await transaction<void>("messages", "readwrite", (store) => {
    const request = store.get([owner, message.id]);
    request.onsuccess = () => {
      if (!request.result) {
        store.put({
          ...message,
          owner_id: owner,
          partner_id: message.sender_id === owner ? message.recipient_id : message.sender_id,
        });
      }
    };
  });
}

export async function getLocalMessages(owner: string, partner?: string): Promise<LocalMessage[]> {
  return transaction<LocalMessage[]>("messages", "readonly", (store, set) => {
    const request = partner
      ? store.index("conversation").getAll([owner, partner])
      : store.index("owner").getAll(owner);
    request.onsuccess = () =>
      set(
        (request.result as StoredMessage[])
          .map(stripOwner)
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      );
  });
}

export async function clearLocalConversation(owner: string, partner: string): Promise<void> {
  await transaction<void>("messages", "readwrite", (store) => {
    const request = store.index("conversation").openCursor(IDBKeyRange.only([owner, partner]));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
}

export async function updateLocalMessageStatus(
  owner: string,
  id: string,
  patch: Partial<
    Pick<
      LocalMessage,
      | "local_status"
      | "read_at"
      | "body"
      | "edited_at"
      | "deleted_at"
      | "recipient_hidden"
      | "attachment_url"
      | "attachment_type"
      | "attachment_name"
      | "attachment_key"
      | "attachment_iv"
    >
  >
): Promise<LocalMessage | null> {
  return transaction<LocalMessage | null>("messages", "readwrite", (store, set) => {
    const request = store.get([owner, id]);
    request.onsuccess = () => {
      const current = request.result as StoredMessage | undefined;
      if (!current) {
        set(null);
        return;
      }
      const rank: LocalStatus[] = ["queued", "sent", "delivered", "read"];
      const next = { ...current, ...patch };
      if (
        current.local_status &&
        patch.local_status &&
        rank.indexOf(current.local_status) > rank.indexOf(patch.local_status)
      ) {
        next.local_status = current.local_status;
      }
      if (current.read_at) next.read_at = current.read_at;
      if (current.deleted_at) {
        next.deleted_at = current.deleted_at;
        next.body = "";
        next.attachment_url = null;
        next.attachment_type = null;
        next.attachment_name = null;
        next.attachment_key = null;
        next.attachment_iv = null;
      }
      store.put(next);
      set(stripOwner(next));
    };
  });
}

export async function listLocalConversations(owner: string): Promise<LocalConversation[]> {
  const grouped = new Map<string, LocalConversation>();
  for (const message of await getLocalMessages(owner)) {
    if (message.recipient_id === owner && message.recipient_hidden) continue;
    const partnerId = message.sender_id === owner ? message.recipient_id : message.sender_id;
    const group = grouped.get(partnerId) ?? { partnerId, last: message, unread: 0 };
    group.last = message;
    if (message.recipient_id === owner && !message.read_at && !message.deleted_at) group.unread++;
    grouped.set(partnerId, group);
  }
  return [...grouped.values()].sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
}

export async function saveLocalContact(owner: string, profile: PublicProfile): Promise<void> {
  await transaction<void>("contacts", "readwrite", (store) => {
    store.put({ ...profile, owner_id: owner });
  });
}

export async function getLocalContacts(owner: string): Promise<PublicProfile[]> {
  return transaction<PublicProfile[]>("contacts", "readonly", (store, set) => {
    const request = store.index("owner").getAll(owner);
    request.onsuccess = () => set(request.result.map(({ owner_id: _owner, ...profile }) => profile));
  });
}

export async function saveRelayOutbox(item: RelayOutboxItem): Promise<void> {
  await transaction<void>("outbox", "readwrite", (store) => {
    store.put(item);
  });
}

export async function getRelayOutbox(owner: string): Promise<RelayOutboxItem[]> {
  return transaction<RelayOutboxItem[]>("outbox", "readonly", (store, set) => {
    const request = store.index("owner").getAll(owner);
    request.onsuccess = () =>
      set(request.result.sort((a: RelayOutboxItem, b: RelayOutboxItem) => a.created_at.localeCompare(b.created_at)));
  });
}

export async function removeRelayOutbox(owner: string, id: string): Promise<void> {
  await transaction<void>("outbox", "readwrite", (store) => {
    store.delete([owner, id]);
  });
}
