import { Link } from "@tanstack/react-router";
import { Home, Sparkles, User } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BACKGROUNDS, isDarkBackground } from "@/lib/purpose";
import { cn } from "@/lib/utils";
import { getMyProfile } from "@/lib/media";

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
  const isDark = isDarkBackground(bg);
  const [myAvatar, setMyAvatar] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("purpose-my-avatar");
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    let active = true;
    void getMyProfile()
      .then((p) => {
        if (!active) return;
        if (p?.avatar_url) {
          setMyAvatar(p.avatar_url);
          try {
            localStorage.setItem("purpose-my-avatar", p.avatar_url);
          } catch {}
        } else if (p && !p.avatar_url) {
          setMyAvatar(null);
          try {
            localStorage.removeItem("purpose-my-avatar");
          } catch {}
        }
      })
      .catch(() => {});

    const onAvatarUpdated = () => {
      try {
        const stored = localStorage.getItem("purpose-my-avatar");
        setMyAvatar(stored || null);
      } catch {}
    };

    window.addEventListener("purpose-avatar-updated", onAvatarUpdated);
    return () => {
      active = false;
      window.removeEventListener("purpose-avatar-updated", onAvatarUpdated);
    };
  }, []);

  return (
    <div
      className={cn("flex h-dvh flex-col transition-colors duration-200", isDark && "dark text-foreground")}
      style={{ backgroundColor: bg }}
    >
      <header className="shrink-0 border-b border-border bg-background/80 backdrop-blur">{header}</header>
      <main className="flex-1 overflow-y-auto">{children}</main>
      <footer className="shrink-0 border-t border-border bg-background/90 backdrop-blur">
        <nav className="mx-auto grid max-w-2xl grid-cols-3 items-center px-4 py-2">
          <Link
            to="/home"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground"
            activeProps={{ className: "!text-primary font-semibold" }}
          >
            <Home className="h-5 w-5" /> Home
          </Link>
          <Link
            to="/mypurpose"
            className="mx-auto -mt-7 flex flex-col items-center gap-1 text-xs font-semibold text-primary"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
              <Sparkles className="h-6 w-6" />
            </span>
            MyPurpose
          </Link>
          <Link
            to="/profile"
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground"
            activeProps={{ className: "!text-primary font-semibold" }}
          >
            {myAvatar ? (
              <img
                src={myAvatar}
                alt="Profile"
                className="h-5 w-5 rounded-full object-cover ring-1 ring-border shadow-xs"
              />
            ) : (
              <User className="h-5 w-5" />
            )}
            Profile
          </Link>
        </nav>
      </footer>
    </div>
  );
}