import { Link } from "@tanstack/react-router";
import { Home, Sparkles, User } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BACKGROUNDS } from "@/lib/purpose";

export function useBackground() {
  const [bg, setBg] = useState<string>(BACKGROUNDS[0]!.value);
  useEffect(() => {
    const s = localStorage.getItem("purpose-bg");
    if (s) setBg(s);
  }, []);
  const set = (v: string) => {
    setBg(v);
    localStorage.setItem("purpose-bg", v);
  };
  return [bg, set] as const;
}

export function AppShell({ header, children, bg }: { header: ReactNode; children: ReactNode; bg: string }) {
  return (
    <div className="flex h-dvh flex-col transition-colors" style={{ backgroundColor: bg }}>
      <header className="shrink-0 border-b border-border bg-background/80 backdrop-blur">{header}</header>
      <main className="flex-1 overflow-y-auto">{children}</main>
      <footer className="shrink-0 border-t border-border bg-background/90 backdrop-blur">
        <nav className="mx-auto grid max-w-2xl grid-cols-3 items-center px-4 py-2">
          <Link to="/home" className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground" activeProps={{ className: "!text-primary font-semibold" }}>
            <Home className="h-5 w-5" /> Home
          </Link>
          <Link to="/mypurpose" className="mx-auto -mt-7 flex flex-col items-center gap-1 text-xs font-semibold text-primary">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
              <Sparkles className="h-6 w-6" />
            </span>
            MyPurpose
          </Link>
          <Link to="/profile" className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground" activeProps={{ className: "!text-primary font-semibold" }}>
            <User className="h-5 w-5" /> Profile
          </Link>
        </nav>
      </footer>
    </div>
  );
}
