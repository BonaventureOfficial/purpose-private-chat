GRANT DELETE ON public.messages TO authenticated;
CREATE POLICY "Recipients consume relay items" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = recipient_id);
DROP POLICY "Users enqueue own relay items" ON public.messages;
CREATE POLICY "Users enqueue own relay items" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND sender_id <> recipient_id AND char_length(body) <= 4000 AND ((relay_kind = 'message' AND (char_length(trim(body)) >= 1 OR attachment_url IS NOT NULL)) OR (relay_kind = 'edit' AND char_length(trim(body)) >= 1 AND attachment_url IS NULL) OR (relay_kind IN ('delete','read','delivered') AND body = '' AND attachment_url IS NULL)));
ALTER FUNCTION public.acknowledge_relay(uuid) SECURITY INVOKER;