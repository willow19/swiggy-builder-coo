ALTER TABLE public.messages ADD COLUMN client_id TEXT;
ALTER TABLE public.messages ADD CONSTRAINT messages_user_client_unique UNIQUE (user_id, client_id);