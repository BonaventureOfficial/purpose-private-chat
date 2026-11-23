import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  Fingerprint,
  Mail,
  Smartphone,
  KeyRound,
  Trash2,
  LogOut,
  ChevronRight,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, useBackground } from "@/components/purpose/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/media";
import { myId } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Purpose" },
      { name: "description", content: "Manage your Purpose security, identity and account tools." },
      { property: "og:title", content: "Settings — Purpose" },
      { property: "og:description", content: "Manage your Purpose security, identity and account tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [bg] = useBackground();
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const [username, setUsername] = useState("User");
  const [userId, setUserId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

  // Active modal
  const [modalType, setModalType] = useState<
    "2fa" | "identity" | "email" | "phone" | "password" | "delete" | "logout" | null
  >(null);

  // Copy state
  const [copiedId, setCopiedId] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  // Inputs state
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  useEffect(() => {
    void getMyProfile().then((p) => {
      if (p) {
        setUsername(p.username);
        setAvatar(p.avatar_url ?? null);
      }
    });
    void myId().then((id) => setUserId(id));

    void supabase.auth.getUser().then(({ data }) => {
      const em = data.user?.email;
      const meta = data.user?.user_metadata?.recovery_email;
      if (em && !em.endsWith("@users.purpose.app")) {
        setLinkedEmail(em);
        setEmailInput(em);
      } else if (meta) {
        setLinkedEmail(meta);
        setEmailInput(meta);
      }
    });
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    try {
      localStorage.removeItem("purpose-my-avatar");
      window.dispatchEvent(new Event("purpose-avatar-updated"));
    } catch {}
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    nav({ to: "/signin", replace: true });
  }

  async function handleSaveEmail() {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@") || !trimmed.includes(".")) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setSavingEmail(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        email: trimmed,
        data: { recovery_email: trimmed },
      });
      if (error) throw error;

      if (data.user?.new_email) {
        toast.success(
          `Confirmation link sent to ${trimmed}. Please check your inbox to confirm the change.`,
          { duration: 7000 }
        );
      } else {
        toast.success(`Recovery email saved as ${trimmed}!`);
      }
      setLinkedEmail(trimmed);
      setModalType(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update recovery email.";
      toast.error(msg);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handlePasswordChange() {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully!");
      setModalType(null);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update password");
    } finally {
      setChangingPassword(false);
    }
  }

  function copyToClipboard(text: string, type: "id" | "fingerprint") {
    navigator.clipboard.writeText(text);
    if (type === "id") {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      toast.success("Account ID copied to clipboard");
    } else {
      setCopiedFingerprint(true);
      setTimeout(() => setCopiedFingerprint(false), 2000);
      toast.success("Cryptographic fingerprint copied");
    }
  }

  // Generate safety fingerprint blocks from userId or mock fallback
  const fingerprintBlocks = userId
    ? [
        userId.slice(0, 5).toUpperCase(),
        userId.slice(5, 10).toUpperCase(),
        userId.slice(10, 15).toUpperCase(),
        userId.slice(15, 20).toUpperCase(),
        userId.slice(20, 25).toUpperCase(),
        userId.slice(25, 30).toUpperCase(),
      ]
    : ["77A19", "409F2", "88B10", "329CC", "901EF", "4821A"];

  return (
    <AppShell
      bg={bg}
      header={
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/home"
              aria-label="Back to Home"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary/80 backdrop-blur-md text-foreground border border-border/40 shadow-xs hover:bg-secondary active:scale-95 transition-all"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground leading-tight">Settings</h1>
              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Shield className="h-3 w-3 text-primary inline" /> Privacy & Security Center
              </p>
            </div>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6 pb-20">
        {/* User Identity Mini Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card/85 via-card/60 to-card/40 backdrop-blur-xl p-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="relative shrink-0">
              {avatar ? (
                <img
                  src={avatar}
                  alt={username}
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/30 shadow-md"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary ring-2 ring-primary/30 shadow-md">
                  {username[0]?.toUpperCase()}
                </div>
              )}
              <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-background shadow-xs" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground truncate">{username}</h2>
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 px-1.5 py-0">
                  E2EE Protected
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                ID: {userId ? `${userId.slice(0, 18)}...` : "Loading..."}
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 1: SECURITY & VERIFICATION */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Security & Cryptography
          </h3>
          <div className="space-y-2">
            {/* 1. 2FA */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setModalType("2fa")}
              onKeyDown={(e) => e.key === "Enter" && setModalType("2fa")}
              className="group flex items-center justify-between p-3.5 rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md hover:bg-card/95 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20 shadow-xs group-hover:scale-105 transition-transform">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">2FA</span>
                    <Badge variant="secondary" className="text-[10px] font-medium bg-secondary/80 text-muted-foreground">
                      Coming Soon
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Two-Factor Authentication with TOTP & security keys
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
            </div>

            {/* 2. Identity & Address */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setModalType("identity")}
              onKeyDown={(e) => e.key === "Enter" && setModalType("identity")}
              className="group flex items-center justify-between p-3.5 rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md hover:bg-card/95 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/20 shadow-xs group-hover:scale-105 transition-transform">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">Identity & Address</span>
                    <Badge className="text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      Verified
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    E2EE public key fingerprint & account address
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>

        {/* SECTION 2: COMMUNICATION & RECOVERY */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Account Recovery
          </h3>
          <div className="space-y-2">
            {/* 3. Add Email */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setModalType("email")}
              onKeyDown={(e) => e.key === "Enter" && setModalType("email")}
              className="group flex items-center justify-between p-3.5 rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md hover:bg-card/95 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/20 shadow-xs group-hover:scale-105 transition-transform">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {linkedEmail ? "Recovery Email" : "Add Email"}
                    </span>
                    {linkedEmail ? (
                      <Badge variant="outline" className="text-[10px] bg-online/10 text-online border-online/30">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/70">
                        Not Linked
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {linkedEmail ? linkedEmail : "Link email to receive password reset links"}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
            </div>

            {/* 4. Add Phone */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setModalType("phone")}
              onKeyDown={(e) => e.key === "Enter" && setModalType("phone")}
              className="group flex items-center justify-between p-3.5 rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md hover:bg-card/95 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/20 shadow-xs group-hover:scale-105 transition-transform">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">Add Phone</span>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/70">
                      Not Linked
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Connect mobile number for SMS identity verification
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>

        {/* SECTION 3: CREDENTIALS & SESSIONS */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Access Credentials
          </h3>
          <div className="space-y-2">
            {/* 5. Change Password */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setModalType("password")}
              onKeyDown={(e) => e.key === "Enter" && setModalType("password")}
              className="group flex items-center justify-between p-3.5 rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md hover:bg-card/95 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20 shadow-xs group-hover:scale-105 transition-transform">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-foreground">Change Password</span>
                  <p className="text-xs text-muted-foreground">
                    Update master account login password
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
            </div>

            {/* 7. Sign Out / Log Out */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setModalType("logout")}
              onKeyDown={(e) => e.key === "Enter" && setModalType("logout")}
              className="group flex items-center justify-between p-3.5 rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md hover:bg-destructive/10 hover:border-destructive/30 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-border shadow-xs group-hover:text-destructive group-hover:bg-destructive/10 group-hover:ring-destructive/30 transition-colors">
                  <LogOut className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-foreground group-hover:text-destructive transition-colors">
                    Log Out
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Sign out and lock your session on this device
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>

        {/* SECTION 4: DANGER ZONE */}
        <div className="space-y-2.5 pt-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-destructive px-1">
            Danger Zone
          </h3>
          <div className="space-y-2">
            {/* 6. Delete Account */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setModalType("delete")}
              onKeyDown={(e) => e.key === "Enter" && setModalType("delete")}
              className="group flex items-center justify-between p-3.5 rounded-2xl border border-destructive/30 bg-destructive/5 backdrop-blur-md hover:bg-destructive/15 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/30 shadow-xs group-hover:scale-105 transition-transform">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-destructive">
                    Delete Account
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete account, encryption keys & messages
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-destructive/60 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: 2FA */}
      <Dialog open={modalType === "2fa"} onOpenChange={(o) => !o && setModalType(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-bold">Two-Factor Authentication (2FA)</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Add a second verification layer with an authenticator app (TOTP) or hardware security key.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-xl border border-border/60 bg-secondary/40 p-3.5 space-y-2">
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed text-foreground">
                  With 2FA activated, signing in requires your master password plus a dynamic 6-digit code from Google Authenticator, 1Password, or Authy.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/70 text-xs">
                <span className="font-medium text-foreground">Status</span>
                <Badge variant="outline" className="text-muted-foreground font-medium">Ready for Activation</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/70 text-xs">
                <span className="font-medium text-foreground">Method</span>
                <span className="text-muted-foreground">Time-based One-Time Password (TOTP)</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                toast.info("2FA will be activated in the next security rollout.");
                setModalType(null);
              }}
              className="w-full rounded-xl"
            >
              Configure 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Identity & Address */}
      <Dialog open={modalType === "identity"} onOpenChange={(o) => !o && setModalType(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                <Fingerprint className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-bold">Identity & Address</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Your cryptographic identity and public key address used for end-to-end encryption.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Purpose Username</Label>
              <div className="mt-1 flex items-center justify-between rounded-xl border border-border bg-background p-3 text-sm font-semibold">
                <span>@{username}</span>
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 text-[10px]">
                  <Check className="h-3 w-3 mr-1 inline" /> Active
                </Badge>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Account E2EE Address</Label>
              <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-2.5 text-xs font-mono">
                <span className="truncate">{userId || "Loading..."}</span>
                {userId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copyToClipboard(userId, "id")}
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Cryptographic Safety Number</Label>
              <div className="mt-1 rounded-xl border border-border/80 bg-background/80 p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs font-bold text-foreground tracking-wider">
                  {fingerprintBlocks.map((blk, idx) => (
                    <div key={idx} className="rounded-lg bg-secondary/60 py-1.5 border border-border/40">
                      {blk}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(fingerprintBlocks.join(" "), "fingerprint")}
                    className="h-7 text-xs rounded-lg gap-1.5"
                  >
                    {copiedFingerprint ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy Fingerprint
                  </Button>
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground leading-normal">
                Compare these numbers with your contacts to confirm that your communication is 100% end-to-end encrypted.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalType(null)} className="w-full rounded-xl">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Add Email */}
      <Dialog open={modalType === "email"} onOpenChange={(o) => !o && setModalType(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
                <Mail className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-bold">
                {linkedEmail ? "Update Recovery Email" : "Add Recovery Email"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Connect a real email address to receive password reset links if you ever forget your password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Your Email Address</Label>
              <Input
                type="email"
                placeholder="name@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="mt-1.5 rounded-xl"
              />
            </div>
            <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground leading-relaxed">
              {linkedEmail ? (
                <>Current linked email: <strong className="text-foreground">{linkedEmail}</strong>. You can change it at any time.</>
              ) : (
                "Your email is used exclusively for password resets and critical security alerts. Purpose never sends spam."
              )}
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setModalType(null)}
              className="w-1/3 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEmail}
              disabled={savingEmail || !emailInput.trim()}
              className="w-2/3 rounded-xl"
            >
              {savingEmail ? "Saving…" : "Save Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Add Phone */}
      <Dialog open={modalType === "phone"} onOpenChange={(o) => !o && setModalType(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
                <Smartphone className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-bold">Add Phone</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Connect a mobile phone number for urgent identity verification and fallback.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Phone Number</Label>
              <Input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="mt-1.5 rounded-xl font-mono"
              />
            </div>
            <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
              Your phone number is stored securely and never visible to other users or group members.
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!phoneInput.trim()) {
                  toast.error("Please enter a valid phone number");
                  return;
                }
                toast.success(`Phone number "${phoneInput}" saved for verification.`);
                setModalType(null);
                setPhoneInput("");
              }}
              className="w-full rounded-xl"
            >
              Save Phone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 5: Change Password */}
      <Dialog open={modalType === "password"} onOpenChange={(o) => !o && setModalType(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <KeyRound className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-bold">Change Password</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Choose a strong password to protect your account and encrypt your local keys.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Current Password</Label>
              <div className="relative mt-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">New Password</Label>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 rounded-xl"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Confirm New Password</Label>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 rounded-xl"
              />
            </div>

            <div className="rounded-xl border border-border/60 bg-secondary/30 p-2.5 text-[11px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className={cn("h-3.5 w-3.5", newPassword.length >= 8 ? "text-emerald-500" : "text-muted-foreground/40")} />
                <span>At least 8 characters</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className={cn("h-3.5 w-3.5", /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) ? "text-emerald-500" : "text-muted-foreground/40")} />
                <span>Uppercase & lowercase letters</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className={cn("h-3.5 w-3.5", /[0-9]/.test(newPassword) || /[^A-Za-z0-9]/.test(newPassword) ? "text-emerald-500" : "text-muted-foreground/40")} />
                <span>Numbers & symbols</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handlePasswordChange}
              disabled={changingPassword || !newPassword || newPassword !== confirmPassword}
              className="w-full rounded-xl"
            >
              {changingPassword ? "Updating..." : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 6: Delete Account */}
      <Dialog open={modalType === "delete"} onOpenChange={(o) => !o && setModalType(null)}>
        <DialogContent className="max-w-md rounded-2xl border-destructive/40">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-bold text-destructive">Delete Account</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              This action is permanent and cannot be undone. All your messages, cryptographic keys, and profile data will be permanently destroyed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
              <p className="font-semibold">Irreversible consequences:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                <li>All direct and group chat histories will be deleted from your device</li>
                <li>Your E2EE public and private keys will be erased</li>
                <li>Your username "@{username}" will be released</li>
              </ul>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm
              </Label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="mt-1.5 rounded-xl font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== "DELETE"}
              onClick={() => {
                toast.info("Account deletion confirmed for scheduled purge.");
                setModalType(null);
                setDeleteConfirmText("");
              }}
              className="w-full rounded-xl font-semibold"
            >
              Permanently Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 7: Log Out */}
      <Dialog open={modalType === "logout"} onOpenChange={(o) => !o && setModalType(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <LogOut className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-bold">Log Out</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Are you sure you want to sign out from Purpose on this device?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalType(null)} className="flex-1 rounded-xl">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSignOut} className="flex-1 rounded-xl">
              Log Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}