CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  media_url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_pair_idx ON public.messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);
CREATE INDEX messages_recipient_idx ON public.messages (recipient_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Users send as themselves" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND sender_id <> recipient_id AND char_length(body) BETWEEN 1 AND 4000);
CREATE POLICY "Recipient marks read" ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

CREATE OR REPLACE FUNCTION public.search_profiles(q text)
RETURNS TABLE(id uuid, username text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.avatar_url FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.id <> auth.uid()
    AND char_length(trim(q)) >= 1
    AND lower(p.username) LIKE lower(replace(replace(trim(q), '%', ''), '_', '\_')) || '%'
  ORDER BY p.username LIMIT 20
$$;
CREATE OR REPLACE FUNCTION public.get_public_profiles(ids uuid[])
RETURNS TABLE(id uuid, username text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.avatar_url FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.id = ANY(ids)
$$;
REVOKE EXECUTE ON FUNCTION public.search_profiles(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO authenticated;