
CREATE TABLE public.wallet_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  chain_id integer DEFAULT 11155111,
  balance_wei text,
  tx_count integer DEFAULT 0,
  outbound_tx_count integer DEFAULT 0,
  pubkey_exposures integer DEFAULT 0,
  quantum_risk text DEFAULT 'safe',
  risk_score integer DEFAULT 0,
  sybil_indicators jsonb DEFAULT '{}',
  sybil_score integer DEFAULT 0,
  pramaana_enrolled boolean DEFAULT false,
  phi_hash text,
  analyzed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read wallet analyses"
  ON public.wallet_analyses FOR SELECT TO public USING (true);

CREATE POLICY "Edge functions can insert wallet analyses"
  ON public.wallet_analyses FOR INSERT TO public WITH CHECK (true);

-- Update wallet_bindings: add signature column and unique constraint on phi_hash
ALTER TABLE public.wallet_bindings
  ADD COLUMN IF NOT EXISTS signature text;

-- Add unique constraint on phi_hash (one identity = one wallet)
ALTER TABLE public.wallet_bindings
  ADD CONSTRAINT wallet_bindings_phi_hash_unique UNIQUE (phi_hash);
