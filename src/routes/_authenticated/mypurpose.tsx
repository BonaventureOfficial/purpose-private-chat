import { createFileRoute } from "@tanstack/react-router";
import { AppShell, useBackground } from "@/components/purpose/AppShell";
import { Logo } from "@/components/purpose/Logo";
import { BookOpen, FileText, QrCode, Clapperboard, ContactRound, Hospital, HeartPulse, Stethoscope, Apple, GraduationCap, UsersRound, Languages, NotebookPen, Monitor, Heart, ArrowUpRight, LayoutGrid } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type SubApp = { name: string; icon: LucideIcon };
const categories: { name: string; icon: LucideIcon; theme: string; apps: SubApp[] }[] = [
  {
    name: "Computing", icon: Monitor, theme: "purpose-computing",
    apps: [
      { name: "PDFPro", icon: FileText },
      { name: "QRPro", icon: QrCode },
      { name: "MediaPro", icon: Clapperboard },
      { name: "CVPro", icon: ContactRound },
      { name: "MyPurposeBook", icon: BookOpen },
    ],
  },
  {
    name: "Health", icon: Heart, theme: "purpose-health",
    apps: [
      { name: "MyHospital", icon: Hospital },
      { name: "MyHealth", icon: HeartPulse },
      { name: "MyDoctor/MyClient", icon: Stethoscope },
      { name: "Foods", icon: Apple },
    ],
  },
  {
    name: "Education", icon: GraduationCap, theme: "purpose-education",
    apps: [
      { name: "University", icon: GraduationCap },
      { name: "Classmates", icon: UsersRound },
      { name: "Languages", icon: Languages },
      { name: "Exercises", icon: NotebookPen },
    ],
  },
];

export const Route = createFileRoute("/_authenticated/mypurpose")({
  head: () => ({
    meta: [
      { title: "MyPurpose — Purpose" },
      { name: "description", content: "Explore the MyPurpose collection: computing, health and education in your personal Purpose space." },
      { property: "og:title", content: "MyPurpose — Purpose" },
      { property: "og:description", content: "The MyPurpose collection for computing, health and education." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyPurposePage,
});

function MyPurposePage() {
  const [bg] = useBackground();
  return (
    <AppShell bg={bg} header={
      <div>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 sm:px-6">
          <Logo className="h-10 w-10 shrink-0" />
          <h1 className="text-2xl font-bold text-foreground">MyPurpose</h1>
          <LayoutGrid className="ml-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="purpose-category-window border-t border-border" aria-label="Computing, Health, Education">
          <div className="purpose-category-track">
            {[0, 1].map((copy) => (
              <div className="purpose-category-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
                {categories.map(({ name, icon: Icon, theme }) => (
                  <div className={`${theme} purpose-category-panel`} key={name}>
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="text-sm font-semibold">{name}</span>
                    <ArrowUpRight className="ml-auto h-4 w-4 opacity-50" aria-hidden="true" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    }>
      <div className="mx-auto max-w-2xl px-3 pb-12 pt-7 sm:px-6">
        {categories.map(({ name, icon: CategoryIcon, theme, apps }, index) => (
          <section key={name} className={`${theme} mb-9`} aria-labelledby={`category-${index}`}>
            <div className="mb-4 flex items-center gap-2.5 px-1">
              <CategoryIcon className="purpose-category-symbol h-5 w-5" aria-hidden="true" />
              <h2 id={`category-${index}`} className="text-base font-semibold text-foreground">{name}</h2>
              <span className="ml-1 text-xs tabular-nums text-muted-foreground">{String(apps.length).padStart(2, "0")}</span>
              <div className="ml-2 h-px flex-1 bg-border" />
            </div>
            <ul className="grid grid-cols-4 gap-2 sm:gap-3">
              {apps.map(({ name: appName, icon: Icon }) => (
                <li key={appName} className="purpose-app-tile" aria-disabled="true">
                  <div className="purpose-app-icon"><Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.7} aria-hidden="true" /></div>
                  <span className="purpose-app-name">{appName === "MyDoctor/MyClient" ? <>MyDoctor/<wbr />MyClient</> : appName === "MyPurposeBook" ? <>MyPurpose<wbr />Book</> : appName}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
