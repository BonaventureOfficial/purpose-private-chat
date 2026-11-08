import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocked.rpc, from: mocked.from, auth: { getUser: mocked.getUser } } }));
import { consumeRelay, sendMessage, type Message } from "./chat";
import { getLocalMessages, getRelayOutbox } from "./storage";

const incoming = { id: "incoming", sender_id: "alice", recipient_id: "bob", body: "Save before purge", created_at: "2026-11-08T02:54:00Z", read_at: null, edited_at: null, deleted_at: null, recipient_hidden: false, reply_to_id: null, attachment_url: null, attachment_type: null, attachment_name: null, relay_kind: "message" as const, target_id: null } satisfies Message & { relay_kind: "message"; target_id: null };

beforeEach(async () => {
  vi.clearAllMocks();
  await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase("purpose_vault"); request.onsuccess = () => resolve(); });
  mocked.rpc.mockResolvedValue({ error: null });
});

describe("ephemeral relay", () => {
  it("acknowledges only after received history is committed locally", async () => {
    mocked.rpc.mockImplementation(async () => {
      expect((await getLocalMessages("bob", "alice"))[0]?.body).toBe("Save before purge");
      return { error: null };
    });
    await consumeRelay("bob", incoming);
    expect(mocked.rpc).toHaveBeenCalledWith("acknowledge_relay", { item_id: "incoming" });
  });
  it("never purges a message when local storage fails", async () => {
    const original = globalThis.indexedDB;
    vi.stubGlobal("indexedDB", undefined);
    try { await expect(consumeRelay("bob", incoming)).rejects.toThrow("unavailable"); }
    finally { vi.stubGlobal("indexedDB", original); }
    expect(mocked.rpc).not.toHaveBeenCalled();
  });
  it("cannot consume another recipient's queue", async () => {
    await consumeRelay("eve", incoming);
    expect(mocked.rpc).not.toHaveBeenCalled();
    expect(await getLocalMessages("eve")).toEqual([]);
  });
  it("retains an offline send in local history and the retry outbox", async () => {
    mocked.from.mockReturnValue({ insert: async () => ({ error: { code: "offline", message: "Offline" } }) });
    const result = await sendMessage("alice", "bob", "Offline draft sent");
    expect((await getLocalMessages("alice", "bob"))[0]?.body).toBe("Offline draft sent");
    expect((await getRelayOutbox("alice"))[0]?.id).toBe(result.id);
  });
  it("ignores forged edits from a third party", async () => {
    await consumeRelay("bob", incoming);
    await consumeRelay("bob", { ...incoming, id: "control", sender_id: "eve", body: "Forged", relay_kind: "edit", target_id: "incoming" });
    expect((await getLocalMessages("bob", "alice"))[0]?.body).toBe("Save before purge");
  });
});