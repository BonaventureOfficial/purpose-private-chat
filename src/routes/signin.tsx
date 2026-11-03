import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/purpose/AuthScreen";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Sign in — Purpose" },
      { name: "description", content: "Sign in to your Purpose account." },
      { property: "og:title", content: "Sign in — Purpose" },
      { property: "og:description", content: "Sign in to your private Purpose conversations." },
    ],
  }),
  component: () => <AuthScreen mode="signin" />,
});
