import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalConversation, getLocalMessages, listLocalConversations, saveLocalMessage, updateLocalMessageStatus } from "./storage";
import type { Message } from "./chat";

const message: Message = { id: "one", sender_id: "alice", recipient_id: "bob", body: "Device-only history", created_at: "2026-11-08T02:54:00Z", read_at: null, edited_at: null, deleted_at: null, recipient_hidden: false, reply_to_id: null, attachment_url: null, attachment_type: null, attachment_name: null };

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => { const r = indexedDB.deleteDatabase("purpose_vault"); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); });
});

describe("local device history", () => {
  it("persists sent and received messages, scoped to the signed-in account", async () => {
    await saveLocalMessage("alice", message);
    await saveLocalMessage("bob", message);
    expect((await getLocalMessages("alice", "bob"))[0]?.body).toBe("Device-only history");
    expect((await getLocalMessages("bob", "alice"))[0]?.body).toBe("Device-only history");
    expect(await getLocalMessages("eve")).toEqual([]);
    await expect(saveLocalMessage("eve", message)).rejects.toThrow("does not belong");
  });
  it("keeps history after reopening the database and deduplicates relay retries", async () => {
    await saveLocalMessage("bob", message);
    await updateLocalMessageStatus("bob", "one", { body: "Edited locally", edited_at: "2026-11-08T03:00:00Z" });
    await saveLocalMessage("bob", message);
    expect(await getLocalMessages("bob", "alice")).toHaveLength(1);
    expect((await getLocalMessages("bob", "alice"))[0]?.body).toBe("Edited locally");
  });
  it("does not downgrade read receipts when delivered arrives later", async () => {
    await saveLocalMessage("alice", message);
    await updateLocalMessageStatus("alice", "one", { local_status: "read", read_at: "2026-11-08T03:00:00Z" });
    await updateLocalMessageStatus("alice", "one", { local_status: "delivered", read_at: null });
    const [stored] = await getLocalMessages("alice", "bob");
    expect(stored?.local_status).toBe("read");
    expect(stored?.read_at).toBe("2026-11-08T03:00:00Z");
  });
  it("lists active local conversations with unread counts and excludes recipient-hidden rows", async () => {
    await saveLocalMessage("bob", message);
    expect((await listLocalConversations("bob"))[0]?.unread).toBe(1);
    await updateLocalMessageStatus("bob", "one", { recipient_hidden: true });
    expect(await listLocalConversations("bob")).toEqual([]);
    expect(await getLocalMessages("bob", "alice")).toHaveLength(1);
  });
  it("clears only the chosen conversation on this account", async () => {
    await saveLocalMessage("alice", message);
    await saveLocalMessage("bob", message);
    await saveLocalMessage("alice", { ...message, id: "two", recipient_id: "carol" });
    await clearLocalConversation("alice", "bob");
    expect(await getLocalMessages("alice", "bob")).toEqual([]);
    expect(await getLocalMessages("alice", "carol")).toHaveLength(1);
    expect(await getLocalMessages("bob", "alice")).toHaveLength(1);
  });
});