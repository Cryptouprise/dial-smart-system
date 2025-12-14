-- Create table for business profiles
CREATE TABLE IF NOT EXISTS public.retell_business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_name TEXT NOT NULL,
  business_registration_number TEXT NOT NULL,
  business_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  contact_phone TEXT NOT NULL,
  website_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, submitted, approved, rejected
  retell_profile_id TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create table for verified phone number applications
CREATE TABLE IF NOT EXISTS public.retell_verified_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_profile_id UUID NOT NULL REFERENCES public.retell_business_profiles(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  retell_verification_id TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create table for branded call applications
CREATE TABLE IF NOT EXISTS public.retell_branded_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_profile_id UUID NOT NULL REFERENCES public.retell_business_profiles(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  display_name_short TEXT NOT NULL, -- Up to 15 chars for Verizon
  display_name_long TEXT NOT NULL, -- Up to 32 chars for T-Mobile/AT&T
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  retell_branded_id TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.retell_business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retell_verified_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retell_branded_calls ENABLE ROW LEVEL SECURITY;

-- RLS Policies for business profiles
CREATE POLICY "Users can view their own business profiles"
  ON public.retell_business_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own business profiles"
  ON public.retell_business_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own business profiles"
  ON public.retell_business_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own business profiles"
  ON public.retell_business_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for verified numbers
CREATE POLICY "Users can view their own verified numbers"
  ON public.retell_verified_numbers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own verified numbers"
  ON public.retell_verified_numbers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own verified numbers"
  ON public.retell_verified_numbers FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for branded calls
CREATE POLICY "Users can view their own branded calls"
  ON public.retell_branded_calls FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own branded calls"
  ON public.retell_branded_calls FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own branded calls"
  ON public.retell_branded_calls FOR UPDATE
  USING (auth.uid() = user_id);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add triggers for updated_at
CREATE TRIGGER update_retell_business_profiles_updated_at
  BEFORE UPDATE ON public.retell_business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_retell_verified_numbers_updated_at
  BEFORE UPDATE ON public.retell_verified_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_retell_branded_calls_updated_at
  BEFORE UPDATE ON public.retell_branded_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();