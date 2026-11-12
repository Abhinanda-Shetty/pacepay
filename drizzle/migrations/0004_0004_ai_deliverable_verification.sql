ALTER TABLE public.ai_reviews
  ADD COLUMN requirement_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN inspected_evidence jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ai_reviews.requirement_results IS 'Advisory requirement-wise verification results with evidence, explanations, gaps and suggestions.';
COMMENT ON COLUMN public.ai_reviews.inspected_evidence IS 'Backend inspection manifest for uploaded files, screenshots, website URLs and public repositories.';