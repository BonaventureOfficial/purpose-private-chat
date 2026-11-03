import { describe, expect, it } from "vitest";
import { isStrongPassword } from "./purpose";

describe("password rule", () => {
  it("accepts 8+ chars with digit, upper, lower and symbol", () => expect(isStrongPassword("Abcdef1!")).toBe(true));
  it("rejects fewer than 8 characters", () => expect(isStrongPassword("Ab1!xyz")).toBe(false));
  it("rejects missing digit", () => expect(isStrongPassword("Abcdefg!")).toBe(false));
  it("rejects missing uppercase", () => expect(isStrongPassword("abcdef1!")).toBe(false));
  it("rejects missing lowercase", () => expect(isStrongPassword("ABCDEF1!")).toBe(false));
  it("rejects missing symbol", () => expect(isStrongPassword("Abcdefg1")).toBe(false));
});
