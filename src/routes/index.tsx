import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthScreen } from "@/components/purpose/AuthScreen";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Welcome to Purpose — Private messaging" },
      { name: "description", content: "Your conversations. Your privacy. Your purpose. Create your Purpose account." },
      { property: "og:title", content: "Welcome to Purpose" },
      { property: "og:description", content: "Your conversations. Your privacy. Your purpose." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/home" });
  },
  component: () => <AuthScreen mode="signup" />,
});
