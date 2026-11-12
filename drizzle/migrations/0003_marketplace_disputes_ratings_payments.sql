-- ===== Admin role helper =====
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') $$;

-- Users may only self-assign client or freelancer
DROP POLICY IF EXISTS "pick own role once" ON public.user_roles;
CREATE POLICY "pick own role once" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND role IN ('client','freelancer'));

-- ===== Job board =====
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS projects_open_idx ON public.projects(is_public, status) WHERE freelancer_id IS NULL;

CREATE POLICY "open jobs readable" ON public.projects FOR SELECT TO authenticated
  USING (is_public AND freelancer_id IS NULL AND status = 'active');
CREATE POLICY "admins read projects" ON public.projects FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins read milestones" ON public.milestones FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins read submissions" ON public.submissions FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins read approvals" ON public.approvals FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins read reviews" ON public.ai_reviews FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins read payments" ON public.payments FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins read evidence" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'evidence' AND public.is_admin());

CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL,
  cover_letter text NOT NULL CHECK (char_length(cover_letter) BETWEEN 10 AND 5000),
  proposed_amount numeric(12,2) CHECK (proposed_amount IS NULL OR proposed_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, freelancer_id)
);
GRANT SELECT, INSERT ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applicant or client reads" ON public.applications FOR SELECT TO authenticated
  USING (freelancer_id = auth.uid() OR public.is_project_client(project_id) OR public.is_admin());
CREATE POLICY "freelancer applies to open job" ON public.applications FOR INSERT TO authenticated
  WITH CHECK (freelancer_id = auth.uid() AND status = 'pending' AND public.has_role(auth.uid(),'freelancer')
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.is_public AND p.freelancer_id IS NULL
      AND p.status = 'active' AND p.client_id <> auth.uid()));

CREATE POLICY "applicants and clients see each other" ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applications a JOIN public.projects p ON p.id = a.project_id
    WHERE (p.client_id = auth.uid() AND a.freelancer_id = profiles.id)
       OR (a.freelancer_id = auth.uid() AND p.client_id = profiles.id)));

-- Freelancer can be assigned only by self-join (invite) or via an accepted application; completion needs all milestones settled
CREATE OR REPLACE FUNCTION public.guard_project_freelancer() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.freelancer_id IS DISTINCT FROM OLD.freelancer_id THEN
    IF OLD.freelancer_id IS NOT NULL THEN RAISE EXCEPTION 'Assigned freelancer cannot be changed'; END IF;
    IF NEW.freelancer_id IS DISTINCT FROM auth.uid() AND NOT EXISTS (
      SELECT 1 FROM public.applications a WHERE a.project_id = NEW.id AND a.freelancer_id = NEW.freelancer_id AND a.status = 'accepted') THEN
      RAISE EXCEPTION 'Assigned freelancer cannot be changed';
    END IF;
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN RAISE EXCEPTION 'Client cannot be changed'; END IF;
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND EXISTS (
    SELECT 1 FROM public.milestones m WHERE m.project_id = NEW.id AND m.status NOT IN ('paid','refunded')) THEN
    RAISE EXCEPTION 'All milestones must be paid before the project can be completed';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.accept_application(_application_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.applications; p public.projects; em text;
BEGIN
  SELECT * INTO a FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO p FROM public.projects WHERE id = a.project_id FOR UPDATE;
  IF p.client_id <> auth.uid() THEN RAISE EXCEPTION 'Only the project client can accept applications'; END IF;
  IF p.freelancer_id IS NOT NULL THEN RAISE EXCEPTION 'A freelancer is already assigned'; END IF;
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'Application is no longer pending'; END IF;
  SELECT email INTO em FROM public.profiles WHERE id = a.freelancer_id;
  UPDATE public.applications SET status = 'accepted' WHERE id = a.id;
  UPDATE public.applications SET status = 'rejected' WHERE project_id = p.id AND id <> a.id AND status = 'pending';
  UPDATE public.projects SET freelancer_id = a.freelancer_id, freelancer_email = em, is_public = false, updated_at = now() WHERE id = p.id;
  INSERT INTO public.notifications(user_id,type,title,message,link)
    VALUES (a.freelancer_id,'application','You got the job: '||p.title,'Your application was accepted.','/projects/'||p.id);
END $$;

CREATE OR REPLACE FUNCTION public.reject_application(_application_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.applications; p public.projects;
BEGIN
  SELECT * INTO a FROM public.applications WHERE id = _application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO p FROM public.projects WHERE id = a.project_id;
  IF p.client_id <> auth.uid() THEN RAISE EXCEPTION 'Only the project client can reject applications'; END IF;
  UPDATE public.applications SET status = 'rejected' WHERE id = a.id AND status = 'pending';
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_application(_application_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.applications SET status = 'withdrawn' WHERE id = _application_id AND freelancer_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to withdraw'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_application() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.projects;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id = NEW.project_id;
  INSERT INTO public.notifications(user_id,type,title,message,link)
    VALUES (p.client_id,'application','New application: '||p.title,'A freelancer applied to your job.','/projects/'||p.id);
  RETURN NEW;
END $$;
CREATE TRIGGER notify_application AFTER INSERT ON public.applications FOR EACH ROW EXECUTE FUNCTION public.notify_application();

-- ===== Disputes & refunds =====
CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_id uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 5000),
  requested_refund numeric(12,2) CHECK (requested_refund IS NULL OR requested_refund >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  outcome text CHECK (outcome IN ('no_refund','partial_refund','full_refund','no_change','revision_required','approve')),
  refund_amount numeric(12,2),
  resolution_notes text NOT NULL DEFAULT '',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX disputes_one_open_per_milestone ON public.disputes(milestone_id) WHERE status = 'open';
GRANT SELECT, INSERT ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members and admins read disputes" ON public.disputes FOR SELECT TO authenticated
  USING (public.can_access_project(project_id) OR public.is_admin());
CREATE POLICY "members open disputes" ON public.disputes FOR INSERT TO authenticated
  WITH CHECK (opened_by = auth.uid() AND status = 'open' AND outcome IS NULL AND refund_amount IS NULL AND resolved_by IS NULL
    AND public.can_access_project(project_id)
    AND EXISTS (SELECT 1 FROM public.milestones m WHERE m.id = milestone_id AND m.project_id = disputes.project_id
      AND m.status IN ('submitted','revision_requested','approved','paid')));

CREATE OR REPLACE FUNCTION public.notify_dispute() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.projects; m public.milestones; other uuid;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id = NEW.project_id;
  SELECT * INTO m FROM public.milestones WHERE id = NEW.milestone_id;
  other := CASE WHEN NEW.opened_by = p.client_id THEN p.freelancer_id ELSE p.client_id END;
  IF other IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,type,title,message,link)
      VALUES (other,'dispute','Dispute opened: '||m.title,'An admin will review it.','/milestones/'||m.id);
  END IF;
  INSERT INTO public.notifications(user_id,type,title,message,link)
    SELECT ur.user_id,'dispute','New dispute: '||m.title,p.title,'/admin' FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN NEW;
END $$;
CREATE TRIGGER notify_dispute AFTER INSERT ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.notify_dispute();

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  dispute_id uuid REFERENCES public.disputes(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  paypal_refund_id text UNIQUE,
  status text NOT NULL DEFAULT 'requested',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members and admins read refunds" ON public.refunds FOR SELECT TO authenticated
  USING (public.can_access_project(project_id) OR public.is_admin());

-- ===== Payment hardening =====
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refunded_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS capture_claimed_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status_detail text;
-- Backfill: stale never-captured orders from earlier repeated clicks become cancelled
UPDATE public.payments SET status = 'cancelled', status_detail = 'Superseded: never approved by buyer', updated_at = now()
  WHERE status = 'created';
CREATE UNIQUE INDEX IF NOT EXISTS payments_order_uniq ON public.payments(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_capture_uniq ON public.payments(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_active_attempt ON public.payments(milestone_id) WHERE status IN ('created','approved','pending');
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_completed ON public.payments(milestone_id) WHERE status IN ('completed','partially_refunded','refunded');

-- ===== Ratings =====
CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  reviewee_id uuid NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, reviewer_id)
);
CREATE INDEX ON public.ratings(reviewee_id);
GRANT SELECT, INSERT ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ratings readable" ON public.ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "rate the other party after completion" ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid() AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.status = 'completed'
    AND ((p.client_id = auth.uid() AND p.freelancer_id = reviewee_id) OR (p.freelancer_id = auth.uid() AND p.client_id = reviewee_id))));

CREATE OR REPLACE FUNCTION public.user_rating(_user_id uuid) RETURNS TABLE(avg_rating numeric, rating_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT round(avg(rating)::numeric, 2), count(*) FROM public.ratings WHERE reviewee_id = _user_id $$;