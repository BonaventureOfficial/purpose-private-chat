import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, useBackground } from "@/components/purpose/AppShell";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Purpose" },
      { name: "description", content: "Your Purpose profile." },
      { property: "og:title", content: "Profile — Purpose" },
      { property: "og:description", content: "Your Purpose profile." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const [bg] = useBackground();
  const [name, setName] = useState("Guest");
  useEffect(() => {
    const a = JSON.parse(localStorage.getItem("purpose-account") || "null");
    if (a?.name) setName(a.name);
  }, []);
  return (
    <AppShell bg={bg} header={<h1 className="mx-auto max-w-2xl px-4 py-4 text-lg font-bold text-foreground">Profile</h1>}>
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-10">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-foreground">{name[0]?.toUpperCase()}</div>
        <p className="mt-4 text-xl font-semibold text-foreground">{name}</p>
        <Link to="/signin" className="mt-8 rounded-xl border border-border px-6 py-2 text-sm font-medium text-foreground hover:bg-secondary">Sign out</Link>
      </div>
    </AppShell>
  );
}
