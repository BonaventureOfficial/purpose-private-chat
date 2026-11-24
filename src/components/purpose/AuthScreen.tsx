import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Eye, EyeOff, Lock, MessageCircle, Shield, Star, Heart, Send, X, KeyRound, ArrowLeft, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { isStrongPassword, passwordChecks, syntheticEmail, validateUsername } from "@/lib/purpose";
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
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  // Forgot password flow
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotInput, setForgotInput] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);

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
    if (!u) return setError("Please enter your username.");

    if (mode === "signup") {
      const invalid = validateUsername(u);
      if (invalid) return setError(invalid);
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        if (!isStrongPassword(pw)) {
          setBusy(false);
          return setError("Password does not meet all requirements.");
        }

        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: syntheticEmail(u),
          password: pw,
          options: {
            data: {
              username: u,
            },
          },
        });

        if (signUpErr) {
          setBusy(false);
          const msg = signUpErr.message.toLowerCase();
          if (
            msg.includes("already registered") ||
            msg.includes("user already exists") ||
            msg.includes("duplicate") ||
            msg.includes("unique")
          ) {
            return setError("This username is already taken. Try another.");
          }
          return setError(signUpErr.message || "Account creation failed. Please try again.");
        }

        // If the session wasn't returned immediately, establish it via sign in
        if (!signUpData.session) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: syntheticEmail(u),
            password: pw,
          });
          if (signInErr) {
            setBusy(false);
            return setError("Account created! Please sign in with your username and password.");
          }
        }

        setBusy(false);
        setSuccess(true);
        setTimeout(() => nav({ to: "/home" }), 1200);
      } else {
        // Sign in: support either username or email
        let targetEmail = "";
        if (u.includes("@")) {
          targetEmail = u.toLowerCase();
        } else {
          // Attempt to find real login email if the user linked one
          try {
            const { data: resolvedEmail } = await supabase.rpc("get_login_identifier" as any, {
              p_username: u,
            });
            if (resolvedEmail && typeof resolvedEmail === "string") {
              targetEmail = resolvedEmail;
            }
          } catch {
            // RPC not configured yet; fallback
          }

          if (!targetEmail) {
            targetEmail = syntheticEmail(u);
          }
        }

        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password: pw,
        });

        setBusy(false);
        if (signInErr) {
          return setError("Wrong username or password.");
        }
        nav({ to: "/home" });
      }
    } catch (err: unknown) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    const input = forgotInput.trim();
    if (!input) {
      setError("Please enter your username or recovery email.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      let targetEmail = "";
      if (input.includes("@")) {
        targetEmail = input.toLowerCase();
      } else {
        // Look up by username
        try {
          const { data: resolvedEmail } = await supabase.rpc("get_login_identifier" as any, {
            p_username: input,
          });
          if (resolvedEmail && typeof resolvedEmail === "string" && !resolvedEmail.endsWith("@users.purpose.app")) {
            targetEmail = resolvedEmail;
          }
        } catch {
          // RPC fallback
        }

        if (!targetEmail) {
          setBusy(false);
          return setError(
            "No recovery email found for this username. Make sure you added your recovery email in Settings first, or enter that email address directly."
          );
        }
      }

      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: redirectUrl,
      });

      setBusy(false);
      if (resetErr) {
        return setError(resetErr.message || "Failed to send reset link.");
      }

      setForgotSuccess(true);
    } catch (err: unknown) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
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
        ) : forgotMode ? (
          <div className="space-y-4 rounded-2xl bg-card/90 p-6 shadow-[var(--shadow-soft)] ring-1 ring-border backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Reset Password</h2>
                <p className="text-xs text-muted-foreground">Receive a secure reset link</p>
              </div>
            </div>

            {forgotSuccess ? (
              <div className="space-y-3 py-2 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-online/15 text-online">
                  <Check className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">Reset link sent!</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  If an account matches, a recovery link has been sent to your email inbox. Please check your inbox and spam folder.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(false);
                    setForgotSuccess(false);
                    setForgotInput("");
                  }}
                  className="mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Username or Recovery Email</span>
                  <input
                    value={forgotInput}
                    onChange={(e) => setForgotInput(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. your_username or you@email.com"
                  />
                </label>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setError("");
                    }}
                    className="w-1/3 rounded-xl border border-border bg-background py-3 text-sm font-semibold text-foreground hover:bg-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !forgotInput.trim()}
                    className="w-2/3 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                  >
                    {busy ? "Sending…" : "Send Link"}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl bg-card/90 p-6 shadow-[var(--shadow-soft)] ring-1 ring-border backdrop-blur">
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                {mode === "signup" ? "Create Username" : "Username or Email"}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={mode === "signup" ? 30 : 100}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete={mode === "signup" ? "username" : "username email"}
                className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
                placeholder={mode === "signup" ? "e.g. purpose_fan" : "e.g. purpose_fan or name@email.com"}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">{mode === "signup" ? "Create Password" : "Password"}</span>
              <div className="relative mt-1">
                <input
                  type={show ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  maxLength={64}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-ring"
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

            {mode === "signin" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(true);
                    setError("");
                    setForgotSuccess(false);
                    setForgotInput(name.trim());
                  }}
                  className="text-xs font-medium text-primary hover:underline transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

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
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "PLEASE WAIT…" : mode === "signup" ? "CONFIRM" : "Sign in"}
            </button>
            <div className="space-y-2 text-center text-sm text-muted-foreground">
              <p>
                {mode === "signup" ? (
                  <>Already have an account? <Link to="/signin" className="font-semibold text-primary">Sign in</Link></>
                ) : (
                  <>New here? <Link to="/" className="font-semibold text-primary">Create account</Link></>
                )}
              </p>
              {mode === "signup" && (
                <p className="text-xs">
                  Forgot your password?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setError("");
                      setForgotSuccess(false);
                      setForgotInput(name.trim());
                    }}
                    className="font-medium text-primary hover:underline"
                  >
                    Reset it here
                  </button>
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}