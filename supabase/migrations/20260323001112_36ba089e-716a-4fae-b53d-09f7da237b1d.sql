-- Chain configurations table
CREATE TABLE public.chain_configs (
  chain text PRIMARY KEY,
  chain_id integer NOT NULL,
  rpc_url text NOT NULL,
  explorer_base_url text NOT NULL,
  contract_address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chain_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read chain configs"
  ON public.chain_configs FOR SELECT
  TO public
  USING (true);

-- Seed chain configurations
INSERT INTO public.chain_configs (chain, chain_id, rpc_url, explorer_base_url) VALUES
  ('ethereum_sepolia', 11155111, 'ENV:SEPOLIA_RPC_URL', 'https://sepolia.etherscan.io/tx/'),
  ('arbitrum_sepolia', 421614, 'https://sepolia-rollup.arbitrum.io/rpc', 'https://sepolia.arbiscan.io/tx/'),
  ('base_sepolia', 84532, 'https://sepolia.base.org', 'https://sepolia.basescan.org/tx/');

-- Multichain registrations table
CREATE TABLE public.multichain_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phi_hash text NOT NULL,
  chain text NOT NULL REFERENCES public.chain_configs(chain),
  tx_hash text,
  block_number integer,
  contract_address text,
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(phi_hash, chain)
);

ALTER TABLE public.multichain_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read multichain registrations"
  ON public.multichain_registrations FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Edge functions can insert multichain registrations"
  ON public.multichain_registrations FOR INSERT
  TO public
  WITH CHECK (true);