import logo from "@/assets/purpose-logo.png.asset.json";
import { cn } from "@/lib/utils";

export function Logo({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <img src={logo.url} alt="Purpose logo" className={cn("mix-blend-multiply select-none", className)} style={style} draggable={false} />;
}
