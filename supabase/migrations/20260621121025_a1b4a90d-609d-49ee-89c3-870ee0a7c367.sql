-- Households profile
CREATE TABLE public.households (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  household_name TEXT,
  dietary_preferences TEXT[] NOT NULL DEFAULT '{}',
  preferred_brands TEXT[] NOT NULL DEFAULT '{}',
  budget_cap NUMERIC NOT NULL DEFAULT 2000,
  family_members JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own household" ON public.households FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chat messages (one conversation per user)
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role TEXT NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own messages" ON public.messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Pending actions (draft carts awaiting confirm)
CREATE TABLE public.pending_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT,
  service TEXT NOT NULL DEFAULT 'instamart',
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_actions TO authenticated;
GRANT ALL ON public.pending_actions TO service_role;
ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pending actions" ON public.pending_actions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Mock product catalog (public read)
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL,
  service TEXT NOT NULL DEFAULT 'instamart',
  price NUMERIC NOT NULL,
  unit TEXT,
  is_veg BOOLEAN NOT NULL DEFAULT true,
  diet_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read products" ON public.products FOR SELECT USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_households_updated_at BEFORE UPDATE ON public.households FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pending_actions_updated_at BEFORE UPDATE ON public.pending_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();