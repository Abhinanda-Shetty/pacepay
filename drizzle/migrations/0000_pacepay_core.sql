CREATE TYPE public.app_role AS ENUM ('client','freelancer');
CREATE TYPE public.project_status AS ENUM ('draft','active','completed','cancelled');
CREATE TYPE public.milestone_status AS ENUM ('pending','in_progress','submitted','revision_requested','approved','paid');
CREATE TYPE public.payment_status AS ENUM ('created','approved','completed','failed');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by signed in" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pick own role once" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), COALESCE(NEW.email,''))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  client_id uuid NOT NULL,
  freelancer_id uuid,
  freelancer_email text,
  budget numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status public.project_status NOT NULL DEFAULT 'active',
  start_date date,
  deadline date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.projects(client_id);
CREATE INDEX ON public.projects(freelancer_id);
CREATE INDEX ON public.projects(lower(freelancer_email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id
    AND (p.client_id = auth.uid() OR p.freelancer_id = auth.uid())) $$;
CREATE OR REPLACE FUNCTION public.is_project_client(_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.client_id = auth.uid()) $$;
CREATE OR REPLACE FUNCTION public.is_project_freelancer(_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.freelancer_id = auth.uid()) $$;

CREATE POLICY "members read projects" ON public.projects FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR freelancer_id = auth.uid()
    OR (freelancer_id IS NULL AND lower(freelancer_email) = lower(auth.jwt()->>'email')));
CREATE POLICY "clients create projects" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() AND public.has_role(auth.uid(),'client'));
CREATE POLICY "clients update projects" ON public.projects FOR UPDATE TO authenticated USING (client_id = auth.uid());
CREATE POLICY "clients delete projects" ON public.projects FOR DELETE TO authenticated USING (client_id = auth.uid());

CREATE OR REPLACE FUNCTION public.join_project(_project_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'freelancer') THEN RAISE EXCEPTION 'Only freelancers can join'; END IF;
  UPDATE public.projects SET freelancer_id = auth.uid(), updated_at = now()
  WHERE id = _project_id AND freelancer_id IS NULL AND lower(freelancer_email) = lower(auth.jwt()->>'email');
  IF NOT FOUND THEN RAISE EXCEPTION 'No pending invite for this project'; END IF;
END $$;

CREATE TABLE public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  deliverables text NOT NULL DEFAULT '',
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  deadline date,
  status public.milestone_status NOT NULL DEFAULT 'pending',
  sequence int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.milestones(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestones TO authenticated;
GRANT ALL ON public.milestones TO service_role;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read milestones" ON public.milestones FOR SELECT TO authenticated USING (public.can_access_project(project_id));
CREATE POLICY "client writes milestones" ON public.milestones FOR INSERT TO authenticated WITH CHECK (public.is_project_client(project_id));
CREATE POLICY "client updates milestones" ON public.milestones FOR UPDATE TO authenticated USING (public.is_project_client(project_id) AND status IN ('pending','in_progress'));
CREATE POLICY "client deletes milestones" ON public.milestones FOR DELETE TO authenticated USING (public.is_project_client(project_id) AND status IN ('pending','in_progress'));

CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  description text NOT NULL,
  evidence_urls text[] NOT NULL DEFAULT '{}',
  evidence_files text[] NOT NULL DEFAULT '{}',
  version int NOT NULL DEFAULT 1,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.submissions(milestone_id);
GRANT SELECT, INSERT ON public.submissions TO authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read submissions" ON public.submissions FOR SELECT TO authenticated USING (public.can_access_project(project_id));
CREATE POLICY "freelancer submits" ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND public.is_project_freelancer(project_id)
    AND EXISTS (SELECT 1 FROM public.milestones m WHERE m.id = milestone_id AND m.project_id = submissions.project_id
      AND m.status IN ('pending','in_progress','revision_requested')));

CREATE OR REPLACE FUNCTION public.on_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.milestones SET status = 'submitted', updated_at = now()
   WHERE id = NEW.milestone_id AND status IN ('pending','in_progress','revision_requested');
  RETURN NEW;
END $$;
CREATE TRIGGER submission_status AFTER INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.on_submission();

CREATE TABLE public.ai_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  summary text NOT NULL,
  requirements_checked jsonb NOT NULL DEFAULT '[]',
  requirements_satisfied jsonb NOT NULL DEFAULT '[]',
  missing_requirements jsonb NOT NULL DEFAULT '[]',
  issues jsonb NOT NULL DEFAULT '[]',
  recommendation text NOT NULL CHECK (recommendation IN ('APPROVE','REVISION_REQUIRED','MANUAL_REVIEW')),
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ai_reviews(submission_id);
GRANT SELECT ON public.ai_reviews TO authenticated;
GRANT ALL ON public.ai_reviews TO service_role;
ALTER TABLE public.ai_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read reviews" ON public.ai_reviews FOR SELECT TO authenticated USING (public.can_access_project(project_id));

CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  approved_by uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('approved','revision_requested')),
  comments text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.approvals TO authenticated;
GRANT ALL ON public.approvals TO service_role;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read approvals" ON public.approvals FOR SELECT TO authenticated USING (public.can_access_project(project_id));

CREATE OR REPLACE FUNCTION public.decide_milestone(_submission_id uuid, _approve boolean, _comments text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.submissions;
BEGIN
  SELECT * INTO s FROM public.submissions WHERE id = _submission_id;
  IF s.id IS NULL OR NOT public.is_project_client(s.project_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.milestones WHERE id = s.milestone_id AND status = 'submitted') THEN
    RAISE EXCEPTION 'Milestone is not awaiting review'; END IF;
  INSERT INTO public.approvals (milestone_id, submission_id, project_id, approved_by, status, comments)
  VALUES (s.milestone_id, s.id, s.project_id, auth.uid(), CASE WHEN _approve THEN 'approved' ELSE 'revision_requested' END, COALESCE(_comments,''));
  UPDATE public.milestones SET status = CASE WHEN _approve THEN 'approved'::public.milestone_status ELSE 'revision_requested'::public.milestone_status END, updated_at = now()
  WHERE id = s.milestone_id;
END $$;

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_id uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL,
  payee_id uuid,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  paypal_order_id text UNIQUE,
  paypal_capture_id text,
  status public.payment_status NOT NULL DEFAULT 'created',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.payments(project_id);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read payments" ON public.payments FOR SELECT TO authenticated USING (public.can_access_project(project_id));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "mark own read" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.projects; m public.milestones;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id = NEW.project_id;
  SELECT * INTO m FROM public.milestones WHERE id = NEW.milestone_id;
  IF TG_TABLE_NAME = 'submissions' THEN
    INSERT INTO public.notifications(user_id,type,title,message,link)
    VALUES (p.client_id,'submission','New submission: '||m.title,'Work was submitted for review on '||p.title||'.','/milestones/'||m.id);
  ELSIF TG_TABLE_NAME = 'approvals' AND p.freelancer_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,type,title,message,link)
    VALUES (p.freelancer_id,'approval',
      CASE WHEN NEW.status='approved' THEN 'Milestone approved: ' ELSE 'Revision requested: ' END || m.title,
      COALESCE(NULLIF(NEW.comments,''),'See milestone for details.'),'/milestones/'||m.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notify_submission AFTER INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.notify_events();
CREATE TRIGGER notify_approval AFTER INSERT ON public.approvals FOR EACH ROW EXECUTE FUNCTION public.notify_events();

CREATE POLICY "upload evidence to own project" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidence' AND public.is_project_freelancer(((storage.foldername(name))[1])::uuid));
CREATE POLICY "members read evidence" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'evidence' AND public.can_access_project(((storage.foldername(name))[1])::uuid));
