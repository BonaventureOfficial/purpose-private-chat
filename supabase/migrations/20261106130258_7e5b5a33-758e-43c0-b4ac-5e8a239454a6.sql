ALTER TABLE public.messages
  ADD COLUMN attachment_url text,
  ADD COLUMN attachment_type text CHECK (attachment_type IN ('image','video','pdf')),
  ADD COLUMN attachment_name text CHECK (char_length(attachment_name) <= 200),
  ADD CONSTRAINT messages_attachment_url_ck CHECK (attachment_url IS NULL OR attachment_url LIKE 'https://purpose-api.tuyisengebonaventure29.workers.dev/media/media/%'),
  ADD CONSTRAINT messages_attachment_pair_ck CHECK ((attachment_url IS NULL) = (attachment_type IS NULL));
DROP POLICY "Users send as themselves" ON public.messages;
CREATE POLICY "Users send as themselves" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND sender_id <> recipient_id
    AND char_length(body) <= 4000
    AND (char_length(trim(body)) >= 1 OR attachment_url IS NOT NULL));