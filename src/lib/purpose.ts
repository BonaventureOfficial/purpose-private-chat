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

export type Contact = { id: number; name: string; last: string; time: string; online: boolean; unread: number };

export const CONTACTS: Contact[] = [
  ["Amara Diallo", "See you tomorrow at the meeting 👋", "09:42", true, 2],
  ["Lucas Martin", "I sent you the documents", "09:15", false, 0],
  ["Sofia Rossi", "Haha that's perfect 😂", "08:57", true, 5],
  ["Kwame Mensah", "Can we call later?", "Yesterday", true, 0],
  ["Emma Johnson", "Thanks for your help!", "Yesterday", false, 0],
  ["Yuki Tanaka", "The photos look amazing", "Yesterday", true, 1],
  ["Omar Haddad", "On my way 🚗", "Mon", false, 0],
  ["Léa Dubois", "Did you see the news?", "Mon", true, 0],
  ["Daniel Okafor", "Let's do it 💪", "Sun", false, 3],
  ["Nina Petrova", "Happy birthday! 🎉", "Sun", true, 0],
  ["Carlos Silva", "Voice message", "Sat", false, 0],
  ["Fatou Ndiaye", "Okay, noted.", "Fri", true, 0],
].map(([name, last, time, online, unread], i) => ({ id: i + 1, name, last, time, online, unread }) as Contact);
