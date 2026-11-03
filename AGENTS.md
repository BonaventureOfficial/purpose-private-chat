<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture decisions

- Real accounts are Supabase Auth users created from user name + password only (no email collected). Auth uses a deterministic synthetic email `<lowercased-username>@users.purpose.app` (see `syntheticEmail` in `src/lib/purpose.ts`); accounts are created server-side via the admin client in `src/lib/auth.functions.ts` with `email_confirm: true` because the project has email confirmation enabled and the synthetic inbox cannot receive mail. Sign-in calls `signInWithPassword` with the same synthetic email client-side.
- Username uniqueness is case-insensitive, enforced by the unique index `profiles_username_lower_key` on `lower(username)` in `public.profiles`; the username is written once at signup (metadata) and protected against changes by the `profiles_protect_username` trigger. Keep this invariant when touching auth or profiles.
- No Supabase Storage buckets: all app files (avatars, media) are to be handled by Cloudflare per user decision. Do not create storage buckets in Supabase.
- Signed-in routes (home, profile, mypurpose) live under `src/routes/_authenticated/` gated by the pathless layout `src/routes/_authenticated/route.tsx` (`ssr: false`, redirect to `/signin`). Signup is `/`, sign-in is `/signin`.
