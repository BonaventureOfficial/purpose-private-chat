import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, useBackground } from "@/components/purpose/AppShell";
import { Logo } from "@/components/purpose/Logo";
import {
  BookOpen,
  FileText,
  QrCode,
  Clapperboard,
  ContactRound,
  Hospital,
  HeartPulse,
  Stethoscope,
  Apple,
  GraduationCap,
  UsersRound,
  Languages,
  NotebookPen,
  Monitor,
  Heart,
  ArrowUpRight,
  Sparkles,
  Lock,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type SubApp = {
  name: string;
  tagline: string;
  badge: string;
  gradient: string;
  icon: LucideIcon;
  description: string;
  features: string[];
};

type Category = {
  name: string;
  icon: LucideIcon;
  theme: string;
  accent: string;
  badgeColor: string;
  description: string;
  apps: SubApp[];
};

const categories: Category[] = [
  {
    name: "Computing",
    icon: Monitor,
    theme: "purpose-computing",
    accent: "from-blue-500/10 via-indigo-500/5 to-transparent",
    badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    description: "High-performance productivity and zero-knowledge digital tools.",
    apps: [
      {
        name: "PDFPro",
        tagline: "Secure Docs & Sign",
        badge: "Pro",
        gradient: "from-rose-500 via-red-600 to-amber-600 shadow-rose-500/30",
        icon: FileText,
        description: "Zero-knowledge PDF reader, editor, and biometric document signing.",
        features: ["Client-side PDF rendering", "Watermark protection", "Cryptographic signing"],
      },
      {
        name: "QRPro",
        tagline: "Dynamic QR & Keys",
        badge: "Security",
        gradient: "from-cyan-400 via-teal-500 to-emerald-600 shadow-teal-500/30",
        icon: QrCode,
        description: "High-density encrypted QR generator for offline identity exchanges.",
        features: ["Anti-phishing verification", "Time-based expiring codes", "Vector SVG export"],
      },
      {
        name: "MediaPro",
        tagline: "Cloudflare R2 Studio",
        badge: "Media",
        gradient: "from-violet-500 via-purple-600 to-pink-500 shadow-purple-500/30",
        icon: Clapperboard,
        description: "Ultra-fast media compression and direct streaming through Cloudflare R2.",
        features: ["Up to 20MB instant stream", "Hardware-accelerated codec", "No third-party trackers"],
      },
      {
        name: "CVPro",
        tagline: "Career & Verification",
        badge: "Pro",
        gradient: "from-blue-500 via-indigo-600 to-sky-400 shadow-blue-500/30",
        icon: ContactRound,
        description: "Verified professional profiles, portfolio generation, and identity export.",
        features: ["Tamper-evident credentials", "Custom domain showcase", "One-click resume PDF"],
      },
      {
        name: "MyPurposeBook",
        tagline: "Private Encrypted Vault",
        badge: "Core",
        gradient: "from-amber-400 via-yellow-500 to-orange-600 shadow-amber-500/30",
        icon: BookOpen,
        description: "Your lifelong encrypted thoughts, ideas, and strategic roadmaps.",
        features: ["End-to-end encrypted notes", "Biometric lock option", "Cloudflare decentralized backup"],
      },
    ],
  },
  {
    name: "Health",
    icon: Heart,
    theme: "purpose-health",
    accent: "from-emerald-500/10 via-teal-500/5 to-transparent",
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    description: "Confidential health records and direct client-practitioner links.",
    apps: [
      {
        name: "MyHospital",
        tagline: "Emergency & Centers",
        badge: "Care",
        gradient: "from-teal-400 via-emerald-500 to-cyan-600 shadow-emerald-500/30",
        icon: Hospital,
        description: "Global medical center registry and rapid emergency dispatch alerts.",
        features: ["Geolocation directory", "24/7 emergency hotlines", "Immediate blood group registry"],
      },
      {
        name: "MyHealth",
        tagline: "Vitals & Tracking",
        badge: "Live",
        gradient: "from-rose-500 via-red-500 to-pink-600 shadow-rose-500/30",
        icon: HeartPulse,
        description: "Private biometric tracking, sleep, stress, and medical test history.",
        features: ["Encrypted medical records", "Zero-server health metrics", "Trend analysis graphs"],
      },
      {
        name: "MyDoctor/MyClient",
        tagline: "Direct Tele-Consult",
        badge: "Secure",
        gradient: "from-cyan-500 via-blue-600 to-indigo-600 shadow-cyan-500/30",
        icon: Stethoscope,
        description: "Encrypted peer-to-peer audio and video appointments between doctors and clients.",
        features: ["No middleman call logs", "Direct prescription delivery", "Instant file share via R2"],
      },
      {
        name: "Foods",
        tagline: "Nutrition & Diet",
        badge: "Diet",
        gradient: "from-emerald-400 via-green-500 to-lime-500 shadow-green-500/30",
        icon: Apple,
        description: "Nutritional calorie and micronutrient optimization for natural longevity.",
        features: ["Clean food barcode scan", "Allergen warning filters", "Tailored meal plans"],
      },
    ],
  },
  {
    name: "Education",
    icon: GraduationCap,
    theme: "purpose-education",
    accent: "from-violet-500/10 via-purple-500/5 to-transparent",
    badgeColor: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    description: "Curated academic intelligence and collaborative study communities.",
    apps: [
      {
        name: "University",
        tagline: "Degrees & Modules",
        badge: "Academia",
        gradient: "from-indigo-600 via-purple-600 to-amber-400 shadow-indigo-500/30",
        icon: GraduationCap,
        description: "Accredited syllabus tracks, video lectures, and modular self-paced exams.",
        features: ["Structured course paths", "Progress verification", "Downloadable offline media"],
      },
      {
        name: "Classmates",
        tagline: "Encrypted Study Hub",
        badge: "Social",
        gradient: "from-sky-400 via-blue-500 to-indigo-600 shadow-blue-500/30",
        icon: UsersRound,
        description: "Private study circles, live blackboard sharing, and shared notes.",
        features: ["Private cohort channels", "Peer homework review", "Exam countdown boards"],
      },
      {
        name: "Languages",
        tagline: "Polyglot Mastery",
        badge: "Global",
        gradient: "from-violet-500 via-pink-500 to-rose-400 shadow-pink-500/30",
        icon: Languages,
        description: "Conversational fluency training through vocal drills and real-time pronunciation checks.",
        features: ["Speech analysis", "12 core languages", "Daily flashcard immersion"],
      },
      {
        name: "Exercises",
        tagline: "Quizzes & Drills",
        badge: "Skills",
        gradient: "from-amber-400 via-orange-500 to-red-500 shadow-orange-500/30",
        icon: NotebookPen,
        description: "Timed cognitive challenges, programming exercises, and logic puzzles.",
        features: ["Instant feedback scoring", "Personal weakness diagnosis", "Leaderboards"],
      },
    ],
  },
];

export const Route = createFileRoute("/_authenticated/mypurpose")({
  head: () => ({
    meta: [
      { title: "MyPurpose — Purpose" },
      {
        name: "description",
        content: "Explore the MyPurpose collection: computing, health, and education in your private ecosystem.",
      },
      { property: "og:title", content: "MyPurpose — Purpose" },
      { property: "og:description", content: "The MyPurpose collection for computing, health, and education." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyPurposePage,
});

function MyPurposePage() {
  const [bg] = useBackground();
  const [selectedApp, setSelectedApp] = useState<{ app: SubApp; category: Category } | null>(null);

  return (
    <AppShell
      bg={bg}
      header={
        <div>
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Logo className="h-10 w-10 shrink-0" />
              <div>
                <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">MyPurpose</h1>
                <p className="text-xs text-muted-foreground">Ecosystem & Modular Apps</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>13 Services</span>
            </div>
          </div>

          {/* Category ticker */}
          <div className="purpose-category-window border-t border-border" aria-label="Computing, Health, Education">
            <div className="purpose-category-track">
              {[0, 1].map((copy) => (
                <div className="purpose-category-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
                  {categories.map(({ name, icon: Icon, theme }) => (
                    <div className={`${theme} purpose-category-panel`} key={name}>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="text-xs font-semibold uppercase tracking-wider">{name}</span>
                      <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-2xl px-3 pb-16 pt-6 sm:px-6">
        {categories.map((category, index) => {
          const { name, icon: CategoryIcon, description, badgeColor, apps } = category;
          return (
            <section key={name} className="mb-10" aria-labelledby={`category-${index}`}>
              {/* Category banner */}
              <div className="mb-4 rounded-xl border border-border/60 bg-card/40 p-3 backdrop-blur-sm sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/5 text-foreground">
                      <CategoryIcon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 id={`category-${index}`} className="text-base font-bold text-foreground">
                        {name}
                      </h2>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeColor}`}>
                    {apps.length} apps
                  </span>
                </div>
              </div>

              {/* Grid of high-end App tiles */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5">
                {apps.map((app) => {
                  const Icon = app.icon;
                  return (
                    <button
                      key={app.name}
                      type="button"
                      onClick={() => setSelectedApp({ app, category })}
                      className="group relative flex flex-col items-center justify-between rounded-2xl border border-border/60 bg-gradient-to-b from-card/80 to-card/40 p-4 text-center shadow-xs backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-lg active:scale-95"
                    >
                      {/* Top badge */}
                      <div className="flex w-full items-center justify-between text-[10px]">
                        <span className="rounded-md border border-border/40 bg-background/50 px-1.5 py-0.5 font-medium text-muted-foreground">
                          {app.badge}
                        </span>
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/80 shadow-xs shadow-emerald-500" />
                      </div>

                      {/* 3D Glass App Icon */}
                      <div className="my-2.5 flex items-center justify-center">
                        <div
                          className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr ${app.gradient} shadow-lg ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-110 sm:h-16 sm:w-16`}
                        >
                          <Icon className="h-7 w-7 text-white drop-shadow-md sm:h-8 sm:w-8" strokeWidth={2} />
                          {/* Inner soft gloss reflection */}
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/30 to-transparent" />
                        </div>
                      </div>

                      {/* App labels */}
                      <div className="w-full">
                        <h3 className="truncate text-xs font-bold text-foreground sm:text-sm">{app.name}</h3>
                        <p className="truncate text-[11px] text-muted-foreground">{app.tagline}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Detail Dialog on App Click */}
      <Dialog open={!!selectedApp} onOpenChange={(open) => !open && setSelectedApp(null)}>
        {selectedApp && (
          <DialogContent className="max-w-md rounded-2xl border-border bg-card/95 p-6 backdrop-blur-xl">
            <DialogHeader className="flex flex-col items-center text-center">
              <div
                className={`relative mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr ${selectedApp.app.gradient} shadow-xl ring-2 ring-white/30`}
              >
                <selectedApp.app.icon className="h-10 w-10 text-white drop-shadow-lg" strokeWidth={2.2} />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/30 to-transparent" />
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                <span>{selectedApp.category.name}</span>
                <span>•</span>
                <span className="font-semibold text-foreground">{selectedApp.app.badge}</span>
              </div>

              <DialogTitle className="mt-2 text-xl font-bold tracking-tight text-foreground">
                {selectedApp.app.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {selectedApp.app.tagline}
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-3">
              <p className="text-sm leading-relaxed text-foreground/90">{selectedApp.app.description}</p>

              <div className="rounded-xl border border-border/60 bg-background/50 p-3.5">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  Planned Architecture
                </h4>
                <ul className="space-y-1.5 text-xs text-foreground/80">
                  {selectedApp.app.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2">
                      <Zap className="h-3 w-3 shrink-0 text-amber-500" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <div className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                <span>Next in line for step-by-step activation</span>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}