import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  isStrongPassword,
  normalizeUsername,
  syntheticEmail,
  validateUsername,
} from "./purpose";

/**
 * Creates a real Supabase Auth account from a user name + password.
 * Uniqueness is case-insensitive ("Ali", "ali", "ALI" are the same identity),
 * enforced first here and definitively by a unique index on lower(username)
 * in public.profiles via the on_auth_user_created trigger.
 */
export const signUpWithUsername = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ username: z.string().max(100), password: z.string().max(128) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const username = data.username.trim();
    const invalid = validateUsername(username);
    if (invalid) return { ok: false as const, error: invalid };
    if (!isStrongPassword(data.password)) {
      return { ok: false as const, error: "Password does not meet all requirements." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Case-insensitive availability check against existing profiles.
    const { data: existing, error: checkError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", normalizeUsername(username))
      .limit(1);
    if (checkError) {
      console.error("[purpose] username check failed:", checkError.message);
      return { ok: false as const, error: "Account creation failed. Please try again." };
    }
    if (existing && existing.length > 0) {
      return { ok: false as const, error: "This user name is already taken. Try another." };
    }

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail(username),
      password: data.password,
      email_confirm: true,
      user_metadata: { username },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes("already registered") ||
        msg.includes("duplicate key") ||
        msg.includes("profiles_username_lower_key")
      ) {
        return { ok: false as const, error: "This user name is already taken. Try another." };
      }
      console.error("[purpose] signup failed:", error.message);
      return { ok: false as const, error: "Account creation failed. Please try again." };
    }

    return { ok: true as const };
  });
