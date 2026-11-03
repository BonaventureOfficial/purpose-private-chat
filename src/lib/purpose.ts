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

export const BACKGROUNDS = [
  { name: "White", value: "oklch(1 0 0)" },
  { name: "Cloud", value: "oklch(0.97 0.01 250)" },
  { name: "Sand", value: "oklch(0.96 0.02 85)" },
  { name: "Mint", value: "oklch(0.96 0.03 165)" },
  { name: "Sky", value: "oklch(0.94 0.04 230)" },
  { name: "Blush", value: "oklch(0.95 0.03 10)" },
  { name: "Lavender", value: "oklch(0.94 0.04 295)" },
  { name: "Lemon", value: "oklch(0.97 0.06 100)" },
  { name: "Peach", value: "oklch(0.93 0.05 55)" },
  { name: "Sage", value: "oklch(0.92 0.03 140)" },
];

