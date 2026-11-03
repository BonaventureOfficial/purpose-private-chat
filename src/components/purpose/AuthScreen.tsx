import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Eye, EyeOff, Lock, MessageCircle, Shield, Star, Heart, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Logo } from "./Logo";
import { isStrongPassword, passwordChecks, syntheticEmail, validateUsername } from "@/lib/purpose";
import { signUpWithUsername } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const FLOATERS = [
  { t: "logo", x: 8, y: 10, s: 44, d: 0 }, { t: Lock, x: 82, y: 8, s: 26, d: 1 },
  { t: "logo", x: 70, y: 22, s: 30, d: 2 }, { t: MessageCircle, x: 15, y: 32, s: 28, d: 3 },
  { t: Star, x: 90, y: 40, s: 22, d: 1.5 }, { t: "logo", x: 4, y: 58, s: 34, d: 2.5 },
  { t: Heart, x: 85, y: 64, s: 26, d: 0.5 }, { t: Send, x: 12, y: 82, s: 24, d: 3.5 },
  { t: "logo", x: 78, y: 86, s: 40, d: 1 }, { t: Shield, x: 45, y: 92, s: 24, d: 2 },
  { t: "logo", x: 40, y: 4, s: 26, d: 3 }, { t: MessageCircle, x: 60, y: 76, s: 20, d: 0.8 },
] as const;

export function AuthScreen({ mode }: { mode: "signup" | "signin" }) {
  const nav = useNavigate();
  const signUpFn = useServerFn(signUpWithUsername);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const checks = passwordChecks(pw);

  // The old simulated account (stored on the device) is no longer used.
  useEffect(() => {
    localStorage.removeItem("purpose-account");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const u = name.trim();
    const invalid = validateUsername(u);
    if (invalid) return setError(invalid);

    setBusy(true);
    try {
      if (mode === "signup") {
        if (!isStrongPassword(pw)) {
          setBusy(false);
          return setError("Password does not meet all requirements.");
        }
        const res = await signUpFn({ data: { username: u, password: pw } });
        if (!res.ok) {
          setBusy(false);
          return setError(res.error);
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: syntheticEmail(u),
          password: pw,
        });
        if (error) {
          setBusy(false);
          return setError("Account created, but sign-in failed. Please try signing in.");
        }
        setSuccess(true);
        setTimeout(() => nav({ to: "/home" }), 1200);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: syntheticEmail(u),
          password: pw,
        });
        setBusy(false);
        if (error) return setError("Wrong user name or password.");
        nav({ to: "/home" });
      }
    } catch {
      setBusy(false);
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-10">
      {FLOATERS.map((f, i) => {
        const Icon = f.t === "logo" ? null : f.t;
        return (
          <div key={i} className="purpose-float pointer-events-none absolute opacity-25" style={{ left: `${f.x}%`, top: `${f.y}%`, animationDelay: `${f.d}s` }}>
            {Icon ? <Icon className="text-primary" style={{ width: f.s, height: f.s }} /> : <Logo style={{ width: f.s, height: f.s }} />}
          </div>
        );
      })}

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="rounded-3xl bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border transition-transform active:scale-95">
            <Logo className="h-24 w-24" />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground">Welcome to Purpose 🔐</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your conversations. Your privacy. Your purpose.</p>
        </div>

        {success ? (
          <div className="rounded-2xl bg-card p-6 text-center shadow-[var(--shadow-soft)] ring-1 ring-border">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-online/15 text-online"><Check /></div>
            <p className="mt-3 font-semibold text-foreground">Account created successfully!</p>
            <p className="text-sm text-muted-foreground">Taking you home…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl bg-card/90 p-6 shadow-[var(--shadow-soft)] ring-1 ring-border backdrop-blur">
            <label className="block">
              <span className="text-sm font-medium text-foreground">{mode === "signup" ? "1. Create User Name" : "User Name"}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="username"
                className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring" placeholder="e.g. purpose_fan" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">{mode === "signup" ? "2. Create Password" : "Password"}</span>
              <div className="relative mt-1">
                <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} maxLength={64}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-ring" placeholder="••••••••" />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </label>
            {mode === "signup" && (
              <ul className="grid grid-cols-2 gap-1 text-xs">
                {([["length", "8+ characters"], ["digit", "A number"], ["upper", "An uppercase"], ["lower", "A lowercase"], ["symbol", "A symbol"]] as const).map(([k, l]) => (
                  <li key={k} className={cn("flex items-center gap-1", checks[k] ? "text-online" : "text-muted-foreground")}>
                    {checks[k] ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {l}
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60">
              {busy ? "PLEASE WAIT…" : mode === "signup" ? "CONFIRM" : "Sign in"}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              {mode === "signup" ? (<>Already have an account? <Link to="/signin" className="font-semibold text-primary">Sign in</Link></>)
                : (<>New here? <Link to="/" className="font-semibold text-primary">Create account</Link></>)}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
