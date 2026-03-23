-- Tighten INSERT policies: only allow inserts from service role (edge functions)
-- Drop overly permissive policies
DROP POLICY "Service role can insert commitments" ON public.commitments;
DROP POLICY "Service role can insert enrollment logs" ON public.enrollment_logs;

-- Recreate with auth.role() check - service_role bypasses RLS anyway,
-- so these block anon/authenticated users from inserting
CREATE POLICY "No direct inserts to commitments"
  ON public.commitments FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct inserts to enrollment_logs"
  ON public.enrollment_logs FOR INSERT
  WITH CHECK (false);