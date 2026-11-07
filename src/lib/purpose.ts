// Design-simulation helpers. Account data is stored locally until the real backend is wired in.

export function passwordChecks(pw: string) {
  return {
    length: pw.length >= 8,
    digit: /\d/.test(pw),
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}

export function isStrongPassword(pw: string) {
  return Object.values(passwordChecks(pw)).every(Boolean);
}

// ---------- Username (real Supabase accounts) ----------
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const SIGNUP_EMAIL_DOMAIN = "users.purpose.app";

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase();
}

/** Returns an error message when the user name is invalid, or null when it is valid. */
export function validateUsername(u: string): string | null {
  const v = u.trim();
  if (v.length < USERNAME_MIN) return `User name must be at least ${USERNAME_MIN} characters.`;
  if (v.length > USERNAME_MAX) return `User name must be at most ${USERNAME_MAX} characters.`;
  if (!/^[A-Za-z0-9_]+$/.test(v)) return "User name can only contain letters, numbers and underscores.";
  return null;
}

/**
 * Accounts are identified by user name only. Supabase Auth needs an email,
 * so we derive a deterministic, unique synthetic address from the normalized
 * user name: "Ali", "ali" and "ALI" all resolve to the same account.
 */
export function syntheticEmail(username: string) {
  return `${normalizeUsername(username)}@${SIGNUP_EMAIL_DOMAIN}`;
}

export interface PurposeBackground {
  name: string;
  value: string;
  dark?: boolean;
}

// 10 calibrated premium background options (3 dark tones + 7 light tones)
export const BACKGROUNDS: PurposeBackground[] = [
  // --- 3 Premium Dark Themes ---
  { name: "Obsidian Black", value: "oklch(0.13 0.015 260)", dark: true },
  { name: "Midnight Navy", value: "oklch(0.18 0.065 255)", dark: true },
  { name: "Deep Forest", value: "oklch(0.19 0.06 155)", dark: true },

  // --- 7 Light Themes ---
  { name: "Pure White", value: "oklch(1 0 0)", dark: false },
  { name: "Platinum Cloud", value: "oklch(0.97 0.01 250)", dark: false },
  { name: "Desert Sand", value: "oklch(0.96 0.02 85)", dark: false },
  { name: "Frosted Mint", value: "oklch(0.96 0.03 165)", dark: false },
  { name: "Nordic Sky", value: "oklch(0.94 0.04 230)", dark: false },
  { name: "Soft Lavender", value: "oklch(0.94 0.04 295)", dark: false },
  { name: "Rose Blush", value: "oklch(0.95 0.03 10)", dark: false },
];

/** Determines whether the selected background color is dark to apply inverted high-contrast text. */
export function isDarkBackground(value: string): boolean {
  const bg = BACKGROUNDS.find((b) => b.value === value);
  if (bg && typeof bg.dark === "boolean") return bg.dark;
  const match = value.match(/oklch\(\s*([\d.]+)/);
  if (match && match[1]) {
    return parseFloat(match[1]) < 0.5;
  }
  return false;
}