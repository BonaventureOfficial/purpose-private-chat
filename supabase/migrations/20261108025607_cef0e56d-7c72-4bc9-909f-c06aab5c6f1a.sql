ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_reply_to_id_fkey;
ALTER TABLE public.messages ADD COLUMN relay_kind text NOT NULL DEFAULT 'message' CHECK (relay_kind IN ('message','edit','delete','delivered','read'));
ALTER TABLE public.messages ADD COLUMN target_id uuid;
ALTER TABLE public.messages ADD CONSTRAINT messages_relay_target_ck CHECK ((relay_kind = 'message' AND target_id IS NULL) OR (relay_kind <> 'message' AND target_id IS NOT NULL));
DROP POLICY "Users send as themselves" ON public.messages;
CREATE POLICY "Users enqueue own relay items" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND sender_id <> recipient_id AND char_length(body) <= 4000 AND ((relay_kind = 'message' AND (char_length(trim(body)) >= 1 OR attachment_url IS NOT NULL)) OR (relay_kind = 'edit' AND char_length(trim(body)) >= 1 AND attachment_url IS NULL) OR (relay_kind IN ('delete','read') AND body = '' AND attachment_url IS NULL)));
DROP POLICY "Sender edits own messages" ON public.messages;
DROP POLICY "Recipient marks read" ON public.messages;
REVOKE UPDATE ON public.messages FROM authenticated;
CREATE OR REPLACE FUNCTION public.acknowledge_relay(item_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item public.messages%ROWTYPE;
BEGIN
  DELETE FROM public.messages WHERE id = item_id AND recipient_id = auth.uid() RETURNING * INTO item;
  IF NOT FOUND THEN RETURN; END IF;
  IF item.relay_kind = 'message' THEN
    INSERT INTO public.messages (sender_id, recipient_id, body, relay_kind, target_id) VALUES (item.recipient_id, item.sender_id, '', 'delivered', item.id);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.acknowledge_relay(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_relay(uuid) TO authenticated;