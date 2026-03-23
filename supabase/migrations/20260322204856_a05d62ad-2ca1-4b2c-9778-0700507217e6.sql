CREATE TABLE public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sp_identifier text NOT NULL,
  pseudonym_hash text NOT NULL,
  challenge text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 seconds'),
  used boolean NOT NULL DEFAULT false
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read challenges" ON public.challenges FOR SELECT TO public USING (true);
CREATE POLICY "Edge functions can insert challenges" ON public.challenges FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Edge functions can update challenges" ON public.challenges FOR UPDATE TO public USING (true) WITH CHECK (true);