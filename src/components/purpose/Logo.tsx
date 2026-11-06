import { cn } from "@/lib/utils";

// URL publique absolue du logo Purpose pour s'afficher sur Cloudflare Pages et partout
const LOGO_URL =
  "https://purpose-palette-chat.lovable.app/__l5e/assets-v1/33782a9b-1938-41ec-b3e3-1103a04b81e7/purpose-logo.png";

export function Logo({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <img
      src={LOGO_URL}
      alt="Purpose logo"
      className={cn("mix-blend-multiply select-none", className)}
      style={style}
      draggable={false}
    />
  );
}