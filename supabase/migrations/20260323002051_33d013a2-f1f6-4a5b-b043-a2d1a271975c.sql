CREATE TABLE public.agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_message text NOT NULL,
  agent_response text NOT NULL,
  tools_used text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read agent conversations"
  ON public.agent_conversations FOR SELECT TO public USING (true);

CREATE POLICY "Edge functions can insert agent conversations"
  ON public.agent_conversations FOR INSERT TO public WITH CHECK (true);