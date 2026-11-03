import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/purpose/AuthScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Welcome to Purpose — Private messaging" },
      { name: "description", content: "Your conversations. Your privacy. Your purpose. Create your Purpose account." },
      { property: "og:title", content: "Welcome to Purpose" },
      { property: "og:description", content: "Your conversations. Your privacy. Your purpose." },
    ],
  }),
  component: () => <AuthScreen mode="signup" />,
});
