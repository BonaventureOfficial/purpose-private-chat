ALTER TABLE public.messages
  ADD COLUMN edited_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN recipient_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE POLICY "Sender edits own messages" ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

CREATE OR REPLACE FUNCTION public.messages_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.sender_id <> OLD.sender_id OR NEW.recipient_id <> OLD.recipient_id
     OR NEW.created_at <> OLD.created_at OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
     OR NEW.media_url IS DISTINCT FROM OLD.media_url THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF auth.uid() = OLD.recipient_id THEN
    IF NEW.body <> OLD.body OR NEW.edited_at IS DISTINCT FROM OLD.edited_at
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;
    RETURN NEW;
  END IF;
  -- sender
  IF NEW.read_at IS DISTINCT FROM OLD.read_at OR NEW.recipient_hidden <> OLD.recipient_hidden THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message deleted'; END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    NEW.deleted_at := now(); NEW.body := ''; RETURN NEW;
  END IF;
  IF NEW.body <> OLD.body THEN
    IF char_length(trim(NEW.body)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Invalid length'; END IF;
    NEW.edited_at := now();
  ELSE
    NEW.edited_at := OLD.edited_at;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER messages_guard_update BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_guard_update();