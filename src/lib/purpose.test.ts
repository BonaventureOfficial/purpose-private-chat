import { describe, expect, it } from "vitest";
import {
  isStrongPassword,
  normalizeUsername,
  syntheticEmail,
  validateUsername,
} from "./purpose";

describe("password rule", () => {
  it("accepts 8+ chars with digit, upper, lower and symbol", () => expect(isStrongPassword("Abcdef1!")).toBe(true));
  it("rejects fewer than 8 characters", () => expect(isStrongPassword("Ab1!xyz")).toBe(false));
  it("rejects missing digit", () => expect(isStrongPassword("Abcdefg!")).toBe(false));
  it("rejects missing uppercase", () => expect(isStrongPassword("abcdef1!")).toBe(false));
  it("rejects missing lowercase", () => expect(isStrongPassword("ABCDEF1!")).toBe(false));
  it("rejects missing symbol", () => expect(isStrongPassword("Abcdefg1")).toBe(false));
});

describe("username rule", () => {
  it("accepts letters, numbers and underscores", () => expect(validateUsername("purpose_fan 9x".trim().replace(" ", ""))).toBeNull());
  it("accepts a valid name", () => expect(validateUsername("purpose_fan")).toBeNull());
  it("rejects names shorter than 3 characters", () => expect(validateUsername("ab")).not.toBeNull());
  it("rejects names longer than 30 characters", () => expect(validateUsername("a".repeat(31))).not.toBeNull());
  it("rejects spaces and special characters", () => expect(validateUsername("ali diallo!")).not.toBeNull());

  it("normalizes case and surrounding spaces", () => {
    expect(normalizeUsername("  ALI ")).toBe("ali");
  });

  it("maps Ali, ali and ALI to the same synthetic email (one identity)", () => {
    expect(syntheticEmail("Ali")).toBe(syntheticEmail("ali"));
    expect(syntheticEmail("ALI")).toBe(syntheticEmail("ali"));
    expect(syntheticEmail("Ali")).toBe("ali@users.purpose.app");
  });
});
