
CREATE TABLE public.merkle_roots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id integer NOT NULL REFERENCES public.anonymity_sets(set_id),
  root_hash text NOT NULL,
  leaf_count integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.merkle_roots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read merkle roots"
  ON public.merkle_roots FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Edge functions can insert merkle roots"
  ON public.merkle_roots FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Edge functions can update merkle roots"
  ON public.merkle_roots FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);
