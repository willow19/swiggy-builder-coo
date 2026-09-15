CREATE TABLE public.swiggy_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  state TEXT NOT NULL DEFAULT 'authenticating',
  auth_url TEXT,
  access_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT,
  client_information JSONB,
  code_verifier TEXT,
  oauth_state TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT ALL ON public.swiggy_connections TO service_role;
ALTER TABLE public.swiggy_connections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_swiggy_connections_updated_at BEFORE UPDATE ON public.swiggy_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();