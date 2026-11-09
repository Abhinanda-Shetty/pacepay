-- 1. New milestones must start as pending (prevents skipping review/approval)
DROP POLICY IF EXISTS "client writes milestones" ON public.milestones;
CREATE POLICY "client writes milestones" ON public.milestones FOR INSERT TO authenticated
  WITH CHECK (public.is_project_client(project_id) AND status = 'pending'::milestone_status);
DROP POLICY IF EXISTS "client updates milestones" ON public.milestones;
CREATE POLICY "client updates milestones" ON public.milestones FOR UPDATE TO authenticated
  USING (public.is_project_client(project_id) AND status IN ('pending','in_progress'))
  WITH CHECK (public.is_project_client(project_id) AND status IN ('pending','in_progress'));

-- 2. Profiles visible only to self and people you share a project with
DROP POLICY IF EXISTS "profiles readable by signed in" ON public.profiles;
CREATE POLICY "profiles visible to self and collaborators" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE (p.client_id = auth.uid() AND p.freelancer_id = profiles.id)
       OR (p.freelancer_id = auth.uid() AND p.client_id = profiles.id)
       OR (p.client_id = profiles.id AND p.freelancer_id IS NULL AND lower(p.freelancer_email) = lower(auth.jwt()->>'email'))));

-- 3. Assigned freelancer (payee) cannot be swapped; only join_project assigns self
CREATE OR REPLACE FUNCTION public.guard_project_freelancer() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.freelancer_id IS DISTINCT FROM OLD.freelancer_id THEN
    IF OLD.freelancer_id IS NOT NULL OR NEW.freelancer_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Assigned freelancer cannot be changed';
    END IF;
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN RAISE EXCEPTION 'Client cannot be changed'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_project_freelancer ON public.projects;
CREATE TRIGGER guard_project_freelancer BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_freelancer();

-- 4. Projects with payment records cannot be deleted (keeps payment audit trail)
DROP POLICY IF EXISTS "clients delete projects" ON public.projects;
CREATE POLICY "clients delete projects" ON public.projects FOR DELETE TO authenticated
  USING (client_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM public.payments pm WHERE pm.project_id = projects.id));