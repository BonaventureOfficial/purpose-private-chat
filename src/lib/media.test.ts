import { describe, expect, it } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { vi } from "vitest";
import { checkFile } from "./media";
const MB = 1024 * 1024;
describe("checkFile", () => {
  it("accepts a 19 MB, 59 s mp4", () => expect(checkFile("video/mp4", 19 * MB, 59)).toEqual({ kind: "video" }));
  it("rejects a video over 20 MB", () => expect("error" in checkFile("video/mp4", 21 * MB, 30)).toBe(true));
  it("rejects a video over 1 minute", () => expect("error" in checkFile("video/mp4", 5 * MB, 75)).toBe(true));
  it("accepts a PDF", () => expect(checkFile("application/pdf", MB)).toEqual({ kind: "pdf" }));
  it("rejects non-standard formats", () => expect("error" in checkFile("application/zip", MB)).toBe(true));
  it("accepts a voice recording", () => expect(checkFile("audio/webm;codecs=opus", MB)).toEqual({ kind: "audio" }));
});
