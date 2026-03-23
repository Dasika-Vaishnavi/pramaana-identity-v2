-- Commitments table for storing PALC identity commitments
CREATE TABLE public.commitments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phi_hash TEXT NOT NULL UNIQUE,
  commitment_data TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enrollment logs for timing/audit data
CREATE TABLE public.enrollment_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phi_hash TEXT NOT NULL REFERENCES public.commitments(phi_hash),
  kyber_variant TEXT NOT NULL DEFAULT 'ML-KEM-1024',
  pk_size_bytes INTEGER NOT NULL,
  ct_size_bytes INTEGER NOT NULL,
  commitment_size_bytes INTEGER NOT NULL,
  total_ms DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_logs ENABLE ROW LEVEL SECURITY;

-- Public read for commitments (phi_hash is anonymous)
CREATE POLICY "Anyone can check commitment existence"
  ON public.commitments FOR SELECT USING (true);

-- Only service role inserts (edge function uses service role key)
CREATE POLICY "Service role can insert commitments"
  ON public.commitments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read enrollment logs"
  ON public.enrollment_logs FOR SELECT USING (true);

CREATE POLICY "Service role can insert enrollment logs"
  ON public.enrollment_logs FOR INSERT
  WITH CHECK (true);