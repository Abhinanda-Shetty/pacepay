DROP POLICY IF EXISTS "ratings readable" ON public.ratings;
CREATE POLICY "ratings readable by participants" ON public.ratings
FOR SELECT TO authenticated
USING (
  reviewer_id = auth.uid()
  OR reviewee_id = auth.uid()
  OR public.can_access_project(project_id)
  OR public.is_admin()
);