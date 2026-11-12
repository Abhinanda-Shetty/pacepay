ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'partially_refunded';
ALTER TYPE public.milestone_status ADD VALUE IF NOT EXISTS 'refunded';