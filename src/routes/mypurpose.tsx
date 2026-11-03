import { createFileRoute } from "@tanstack/react-router";
import { AppShell, useBackground } from "@/components/purpose/AppShell";
import { Logo } from "@/components/purpose/Logo";

export const Route = createFileRoute("/mypurpose")({
  head: () => ({
    meta: [
      { title: "MyPurpose — Purpose" },
      { name: "description", content: "MyPurpose: your personal space inside Purpose." },
      { property: "og:title", content: "MyPurpose — Purpose" },
      { property: "og:description", content: "Your personal space inside Purpose." },
    ],
  }),
  component: MyPurposePage,
});

function MyPurposePage() {
  const [bg] = useBackground();
  return (
    <AppShell bg={bg} header={<h1 className="mx-auto max-w-2xl px-4 py-4 text-lg font-bold text-foreground">MyPurpose</h1>}>
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
        <Logo className="purpose-float h-28 w-28" />
        <h2 className="mt-6 text-2xl font-bold text-foreground">Something powerful is coming</h2>
        <p className="mt-2 text-muted-foreground">MyPurpose is your personal space. It will grow with you.</p>
      </div>
    </AppShell>
  );
}
