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
      <header
        className={cn(
          "shrink-0 border-b backdrop-blur-xl shadow-xs transition-colors duration-200",
          isDark
            ? "border-white/10 bg-black/50 text-white"
            : "border-border/50 bg-background/75 text-foreground"
        )}
      >
        {header}
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
      <footer
        className={cn(
          "shrink-0 border-t backdrop-blur-xl shadow-lg transition-colors duration-200",
          isDark
            ? "border-white/10 bg-gradient-to-t from-black/85 via-black/75 to-black/60 text-white"
            : "border-border/50 bg-gradient-to-t from-background/95 via-background/85 to-background/70 text-foreground"
        )}
      >
        <nav className="mx-auto grid max-w-2xl grid-cols-3 items-center px-4 py-2">
          <Link
            to="/home"
            className="group flex flex-col items-center gap-1 text-xs font-medium text-muted-foreground transition-all duration-150 hover:text-foreground active:scale-95"
            activeProps={{ className: "!text-primary font-semibold" }}
          >
            <div className="flex h-8 w-12 items-center justify-center rounded-full transition-colors group-hover:bg-primary/10">
              <Home className="h-5 w-5" />
            </div>
            <span>Home</span>
          </Link>
          <Link
            to="/mypurpose"
            className="mx-auto -mt-6 flex flex-col items-center gap-1 text-xs font-semibold text-primary transition-transform duration-200 active:scale-95 hover:scale-105"
          >
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-primary via-primary to-primary/85 text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background/80 backdrop-blur-xs">
              <Sparkles className="h-6 w-6" />
            </span>
            <span>MyPurpose</span>
          </Link>
          <Link
            to="/profile"
            className="group flex flex-col items-center gap-1 text-xs font-medium text-muted-foreground transition-all duration-150 hover:text-foreground active:scale-95"
            activeProps={{ className: "!text-primary font-semibold" }}
          >
            <div className="flex h-8 w-12 items-center justify-center rounded-full transition-colors group-hover:bg-primary/10">
              {myAvatar ? (
                <img
                  src={myAvatar}
                  alt="Profile"
                  className="h-6 w-6 rounded-full object-cover ring-1.5 ring-primary/40 shadow-xs"
                />
              ) : (
                <User className="h-5 w-5" />
              )}
            </div>
            <span>Profile</span>
          </Link>
        </nav>
      </footer>
    </div>
  );
}