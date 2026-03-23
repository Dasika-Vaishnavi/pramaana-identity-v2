ALTER TABLE public.commitments ADD COLUMN pk_hash TEXT;
CREATE UNIQUE INDEX idx_commitments_pk_hash ON public.commitments(pk_hash);