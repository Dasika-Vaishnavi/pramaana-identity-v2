
CREATE TABLE public.wallet_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  phi_hash text NOT NULL,
  chain_id integer NOT NULL DEFAULT 11155111,
  bound_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read wallet bindings"
  ON public.wallet_bindings FOR SELECT TO public USING (true);

CREATE POLICY "Anyone can insert wallet bindings"
  ON public.wallet_bindings FOR INSERT TO public WITH CHECK (true);
