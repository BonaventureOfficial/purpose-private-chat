import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Check, Eye, EyeOff, Lock, MessageCircle, Shield, Star, Heart, Send, X, KeyRound, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/purpose/Logo";
import { isStrongPassword, passwordChecks } from "@/lib/purpose";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Purpose" },
      { name: "description", content: "Create a new password for your Purpose account." },
      { property: "og:title", content: "Reset Password — Purpose" },
    ],
  }),
  component: ResetPasswordPage,
});

const FLOATERS = [
  { t: "logo", x: 8, y: 10, s: 44, d: 0 }, { t: Lock, x: 82, y: 8, s: 26, d: 1 },
  { t: "logo", x: 70, y: 22, s: 30, d: 2 }, { t: MessageCircle, x: 15, y: 32, s: 28, d: 3 },
  { t: Star, x: 90, y: 40, s: 22, d: 1.5 }, { t: "logo", x: 4, y: 58, s: 34, d: 2.5 },
  { t: Heart, x: 85, y: 64, s: 26, d: 0.5 }, { t: Send, x: 12, y: 82, s: 24, d: 3.5 },
  { t: "logo", x: 78, y: 86, s: 40, d: 1 }, { t: Shield, x: 45, y: 92, s: 24, d: 2 },
  { t: "logo", x: 40, y: 4, s: 26, d: 3 }, { t: MessageCircle, x: 60, y: 76, s: 20, d: 0.8 },
] as const;

function ResetPasswordPage() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  const checks = passwordChecks(pw);

  useEffect(() => {
    // Check if recovery session or token is active
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setHasSession(true);
      } else {
        // Look at URL hash for access_token or type=recovery
        if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
          setHasSession(true);
        } else {
          setHasSession(false);
        }
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(true);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");

    if (!isStrongPassword(pw)) {
      return setError("New password does not meet all security requirements.");
    }

    if (pw !== confirmPw) {
      return setError("Passwords do not match.");
    }

    setBusy(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: pw,
      });

      if (updateErr) {
        setBusy(false);
        return setError(updateErr.message || "Failed to update password.");
      }

      setBusy(false);
      setSuccess(true);
      toast.success("Password updated successfully!");
      setTimeout(() => {
        nav({ to: "/home" });
      }, 1500);
    } catch (err: unknown) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-10">
      {FLOATERS.map((f, i) => {
        const Icon = f.t === "logo" ? null : f.t;
        return (
          <div
            key={i}
            className="purpose-float pointer-events-none absolute opacity-25"
            style={{ left: `${f.x}%`, top: `${f.y}%`, animationDelay: `${f.d}s` }}
          >
            {Icon ? <Icon className="text-primary" style={{ width: f.s, height: f.s }} /> : <Logo style={{ width: f.s, height: f.s }} />}
          </div>
        );
      })}

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="rounded-3xl bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border transition-transform active:scale-95">
            <Logo className="h-24 w-24" />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground">Reset Password 🔐</h1>
          <p className="mt-2 text-sm text-muted-foreground">Create a new secure password for your Purpose account.</p>
        </div>

        {success ? (
          <div className="rounded-2xl bg-card p-6 text-center shadow-[var(--shadow-soft)] ring-1 ring-border">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-online/15 text-online">
              <Check className="h-6 w-6" />
            </div>
            <p className="mt-3 font-semibold text-foreground">Password updated successfully!</p>
            <p className="text-sm text-muted-foreground">Redirecting to your conversations…</p>
          </div>
        ) : hasSession === false ? (
          <div className="space-y-4 rounded-2xl bg-card/90 p-6 shadow-[var(--shadow-soft)] ring-1 ring-border backdrop-blur text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h2 className="text-base font-bold text-foreground">Expired or Invalid Link</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This password reset link is invalid or has expired. Please request a new recovery link from the sign-in page.
            </p>
            <Link
              to="/signin"
              className="mt-2 block w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Back to Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4 rounded-2xl bg-card/90 p-6 shadow-[var(--shadow-soft)] ring-1 ring-border backdrop-blur">
            <label className="block">
              <span className="text-sm font-medium text-foreground">New Password</span>
              <div className="relative mt-1">
                <input
                  type={show ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  maxLength={64}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </label>

            <ul className="grid grid-cols-2 gap-1 text-xs">
              {([["length", "8+ characters"], ["digit", "A number"], ["upper", "An uppercase"], ["lower", "A lowercase"], ["symbol", "A symbol"]] as const).map(([k, l]) => (
                <li key={k} className={cn("flex items-center gap-1", checks[k] ? "text-online" : "text-muted-foreground")}>
                  {checks[k] ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {l}
                </li>
              ))}
            </ul>

            <label className="block">
              <span className="text-sm font-medium text-foreground">Confirm New Password</span>
              <div className="relative mt-1">
                <input
                  type={show ? "text" : "password"}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  maxLength={64}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
                />
              </div>
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60 text-sm"
            >
              {busy ? "UPDATING PASSWORD…" : "UPDATE PASSWORD"}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              Remember your password?{" "}
              <Link to="/signin" className="font-semibold text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}