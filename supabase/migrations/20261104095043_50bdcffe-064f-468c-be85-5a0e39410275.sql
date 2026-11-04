CREATE POLICY "Signed-in users can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
ALTER FUNCTION public.search_profiles(text) SECURITY INVOKER;
ALTER FUNCTION public.get_public_profiles(uuid[]) SECURITY INVOKER;