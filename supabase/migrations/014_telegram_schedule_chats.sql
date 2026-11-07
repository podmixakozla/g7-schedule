CREATE TABLE public.telegram_schedule_chats (
  chat_id bigint PRIMARY KEY CHECK (chat_id < 0),
  group_code text NOT NULL CHECK (group_code IN ('AR-26-1', 'AR-26-2', 'AR-26sk-1')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_schedule_chats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_schedule_chats FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_schedule_chats TO service_role;
