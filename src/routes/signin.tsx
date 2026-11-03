import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthScreen } from "@/components/purpose/AuthScreen";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Sign in — Purpose" },
      { name: "description", content: "Sign in to your Purpose account." },
      { property: "og:title", content: "Sign in — Purpose" },
      { property: "og:description", content: "Sign in to your private Purpose conversations." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/home" });
  },
  component: () => <AuthScreen mode="signin" />,
});
