
-- Drop old tables (enrollment_logs has FK to commitments, so drop it first)
DROP TABLE IF EXISTS public.enrollment_logs CASCADE;
DROP TABLE IF EXISTS public.commitments CASCADE;

-- 1. anonymity_sets
CREATE TABLE public.anonymity_sets (
  set_id serial PRIMARY KEY,
  capacity integer NOT NULL DEFAULT 1024,
  current_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'filling',
  created_at timestamptz NOT NULL DEFAULT now(),
  contract_address text,
  chain_id integer NOT NULL DEFAULT 11155111
);

ALTER TABLE public.anonymity_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read anonymity sets"
  ON public.anonymity_sets FOR SELECT
  TO public
  USING (true);

-- No direct update from clients; edge functions use service_role

-- 2. commitments (IdR mirror)
CREATE TABLE public.commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id integer REFERENCES public.anonymity_sets(set_id),
  set_index integer NOT NULL,
  phi_hash text UNIQUE NOT NULL,
  commitment_c text NOT NULL,
  pk_idr text NOT NULL,
  ct_size_bytes integer,
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read commitments"
  ON public.commitments FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Edge functions can insert commitments"
  ON public.commitments FOR INSERT
  TO public
  WITH CHECK (true);

-- 3. nullifier_registry
CREATE TABLE public.nullifier_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sp_identifier text NOT NULL,
  nullifier text NOT NULL,
  pseudonym_hash text NOT NULL,
  proof_pi text NOT NULL,
  set_id integer REFERENCES public.anonymity_sets(set_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sp_identifier, nullifier)
);

ALTER TABLE public.nullifier_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read nullifiers"
  ON public.nullifier_registry FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Edge functions can insert nullifiers"
  ON public.nullifier_registry FOR INSERT
  TO public
  WITH CHECK (true);

-- 4. service_providers
CREATE TABLE public.service_providers (
  sp_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  identifier text UNIQUE NOT NULL,
  origin text NOT NULL,
  credential_type text NOT NULL DEFAULT 'schnorr',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read service providers"
  ON public.service_providers FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated can insert service providers"
  ON public.service_providers FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 5. enrollment_logs
CREATE TABLE public.enrollment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phi_hash text REFERENCES public.commitments(phi_hash),
  palc_hash_ms double precision,
  palc_hkdf_ms double precision,
  palc_keygen_ms double precision,
  palc_encrypt_ms double precision,
  palc_total_ms double precision,
  on_chain_tx_hash text,
  on_chain_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enrollment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read enrollment logs"
  ON public.enrollment_logs FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Edge functions can insert enrollment logs"
  ON public.enrollment_logs FOR INSERT
  TO public
  WITH CHECK (true);

-- Enable realtime for commitments
ALTER PUBLICATION supabase_realtime ADD TABLE public.commitments;
