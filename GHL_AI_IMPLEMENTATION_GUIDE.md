# GHL AI Implementation Guide - Complete Step-by-Step Instructions

**Purpose:** Detailed implementation guide for AI coding agent to build GHL integration with tiered pricing, feature toggles, multi-carrier support, and enterprise features.

**Repository:** `/home/runner/work/dial-smart-system/dial-smart-system`

**Existing Foundation (Already Built):**
- ✅ `src/hooks/useGoHighLevel.ts` - 831 lines, complete GHL API integration
- ✅ `supabase/functions/ghl-integration/index.ts` - 977 lines OAuth, webhooks, contact sync
- ✅ `supabase/functions/voice-broadcast-engine/index.ts` - 1,582 lines calling infrastructure
- ✅ `supabase/functions/predictive-dialing-engine/index.ts` - Complete predictive dialing
- ✅ `src/hooks/useAutonomousAgent.ts` - Full autonomous agent system
- ✅ `src/hooks/usePipelineManagement.ts` - Complete pipeline/CRM
- ✅ `supabase/functions/provider-management/index.ts` - Multi-carrier foundation
- ✅ `supabase/functions/ml-learning-engine/index.ts` - Self-learning system
- ✅ `supabase/functions/ai-brain/index.ts` - 4,400 lines AI orchestration

---

## Implementation Approach: Build module-by-module, test after each module

This guide provides complete SQL, TypeScript, and React code for each module. No time estimates - just sequential steps.

**HOW TO USE THIS GUIDE:**
1. Give your AI coding agent: "Implement MODULE 1 from GHL_AI_IMPLEMENTATION_GUIDE.md"
2. Test the implementation in your local environment
3. Once verified, move to: "Implement MODULE 2 from GHL_AI_IMPLEMENTATION_GUIDE.md"
4. Continue through all 10 modules sequentially

Each module below includes:
- Exact file paths to create/modify
- Complete SQL schemas with RLS policies
- Full TypeScript/React code examples
- Database operations and API patterns
- Integration points with existing code

---

# MODULE 1: Database Schema & Feature Toggle System

## Step 1.1: Create user_subscription_plans table

Create file: `supabase/migrations/20260113_subscription_plans.sql`

```sql
-- Subscription plans table
CREATE TABLE IF NOT EXISTS public.user_subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Plan details
  plan_tier TEXT NOT NULL CHECK (plan_tier IN (
    'broadcast_starter',    -- $59/mo - Tier 1
    'smart_broadcast_pro',  -- $149/mo - Tier 2
    'ai_powered_elite',     -- $299/mo - Tier 3
    'autonomous_ferrari',   -- $499/mo - Tier 4
    'enterprise_pro',       -- $1,000/mo - Tier 5
    'enterprise_elite',     -- $1,500/mo - Tier 6
    'white_label'           -- $3,000+/mo - Tier 7
  )),
  plan_status TEXT NOT NULL DEFAULT 'active' CHECK (plan_status IN ('active', 'cancelled', 'suspended', 'trial')),
  
  -- Billing
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  monthly_price DECIMAL(10,2) NOT NULL,
  calls_included INTEGER NOT NULL DEFAULT 1000,
  calls_used INTEGER NOT NULL DEFAULT 0,
  overage_rate DECIMAL(10,4) NOT NULL DEFAULT 0.02, -- $0.02 per call
  
  -- Feature flags (copied from user_feature_toggles for quick access)
  features JSONB NOT NULL DEFAULT '{}',
  
  -- Add-ons (a la carte pricing)
  addons JSONB NOT NULL DEFAULT '[]', -- Array of {name, price, enabled}
  
  -- Dates
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.user_subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription plans"
  ON public.user_subscription_plans
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription plans"
  ON public.user_subscription_plans
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_user_subscription_plans_user_id ON public.user_subscription_plans(user_id);
CREATE INDEX idx_user_subscription_plans_org_id ON public.user_subscription_plans(organization_id);
CREATE INDEX idx_user_subscription_plans_status ON public.user_subscription_plans(plan_status);

-- Trigger to update updated_at
CREATE TRIGGER update_user_subscription_plans_updated_at
  BEFORE UPDATE ON public.user_subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

## Step 1.2: Create user_feature_toggles table

Add to same migration file:

```sql
-- Feature toggles table (30+ granular features)
CREATE TABLE IF NOT EXISTS public.user_feature_toggles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.user_subscription_plans(id) ON DELETE CASCADE,
  
  -- Core Features (Tier 1)
  voice_broadcast BOOLEAN NOT NULL DEFAULT false,
  csv_import BOOLEAN NOT NULL DEFAULT false,
  audio_upload BOOLEAN NOT NULL DEFAULT false,
  tts_generation BOOLEAN NOT NULL DEFAULT false,
  press_1_transfer BOOLEAN NOT NULL DEFAULT false,
  press_2_transfer BOOLEAN NOT NULL DEFAULT false,
  number_rotation BOOLEAN NOT NULL DEFAULT false,
  ghl_contact_sync BOOLEAN NOT NULL DEFAULT false,
  basic_analytics BOOLEAN NOT NULL DEFAULT false,
  
  -- Smart Features (Tier 2)
  progressive_dialing BOOLEAN NOT NULL DEFAULT false,
  campaign_scheduler BOOLEAN NOT NULL DEFAULT false,
  multi_number_management BOOLEAN NOT NULL DEFAULT false,
  basic_pipeline_tracking BOOLEAN NOT NULL DEFAULT false,
  enhanced_ghl_sync BOOLEAN NOT NULL DEFAULT false,
  
  -- AI Features (Tier 3)
  predictive_dialing BOOLEAN NOT NULL DEFAULT false,
  ai_script_optimization BOOLEAN NOT NULL DEFAULT false,
  ai_lead_scoring BOOLEAN NOT NULL DEFAULT false,
  ai_call_outcome_prediction BOOLEAN NOT NULL DEFAULT false,
  self_learning_ml BOOLEAN NOT NULL DEFAULT false,
  advanced_analytics BOOLEAN NOT NULL DEFAULT false,
  ai_tools_access BOOLEAN NOT NULL DEFAULT false, -- All 19 AI tools
  
  -- Autonomous Features (Tier 4)
  autonomous_agent_full BOOLEAN NOT NULL DEFAULT false,
  autonomous_follow_ups BOOLEAN NOT NULL DEFAULT false,
  autonomous_pipeline_movement BOOLEAN NOT NULL DEFAULT false,
  decision_tracking BOOLEAN NOT NULL DEFAULT false,
  lifecycle_management BOOLEAN NOT NULL DEFAULT false,
  
  -- Enterprise Features (Tier 5/6)
  multi_carrier_routing BOOLEAN NOT NULL DEFAULT false,
  intelligent_cost_optimization BOOLEAN NOT NULL DEFAULT false,
  real_time_carrier_monitoring BOOLEAN NOT NULL DEFAULT false,
  multi_ai_provider_support BOOLEAN NOT NULL DEFAULT false,
  custom_toggle_dashboard BOOLEAN NOT NULL DEFAULT false,
  white_label_capabilities BOOLEAN NOT NULL DEFAULT false,
  advanced_reporting BOOLEAN NOT NULL DEFAULT false,
  api_access BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, organization_id)
);

-- RLS Policies
ALTER TABLE public.user_feature_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feature toggles"
  ON public.user_feature_toggles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own feature toggles"
  ON public.user_feature_toggles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_user_feature_toggles_user_id ON public.user_feature_toggles(user_id);
CREATE INDEX idx_user_feature_toggles_org_id ON public.user_feature_toggles(organization_id);
CREATE INDEX idx_user_feature_toggles_plan_id ON public.user_feature_toggles(plan_id);

-- Trigger
CREATE TRIGGER update_user_feature_toggles_updated_at
  BEFORE UPDATE ON public.user_feature_toggles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

## Step 1.3: Create carrier_configurations table

Add to same migration file:

```sql
-- Multi-carrier configuration
CREATE TABLE IF NOT EXISTS public.carrier_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Carrier details
  carrier_name TEXT NOT NULL CHECK (carrier_name IN ('twilio', 'telnyx', 'bandwidth', 'custom_sip')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 1, -- Lower number = higher priority
  
  -- Credentials (encrypted)
  account_sid TEXT,
  auth_token TEXT,
  api_key TEXT,
  api_secret TEXT,
  
  -- Routing strategy
  routing_weight DECIMAL(5,2) NOT NULL DEFAULT 33.33, -- Percentage (0-100)
  cost_per_minute DECIMAL(10,4) NOT NULL DEFAULT 0.01,
  quality_score DECIMAL(3,2) NOT NULL DEFAULT 1.0, -- 0-1
  
  -- Performance metrics
  total_calls_made INTEGER NOT NULL DEFAULT 0,
  successful_calls INTEGER NOT NULL DEFAULT 0,
  failed_calls INTEGER NOT NULL DEFAULT 0,
  avg_call_duration_seconds INTEGER NOT NULL DEFAULT 0,
  total_cost_incurred DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  -- Limits
  daily_call_limit INTEGER,
  concurrent_call_limit INTEGER,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.carrier_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own carrier configs"
  ON public.carrier_configurations
  FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_carrier_configs_user_id ON public.carrier_configurations(user_id);
CREATE INDEX idx_carrier_configs_org_id ON public.carrier_configurations(organization_id);
CREATE INDEX idx_carrier_configs_enabled ON public.carrier_configurations(enabled);
CREATE INDEX idx_carrier_configs_priority ON public.carrier_configurations(priority);

-- Trigger
CREATE TRIGGER update_carrier_configurations_updated_at
  BEFORE UPDATE ON public.carrier_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

## Step 1.4: Create ai_provider_configurations table

Add to same migration file:

```sql
-- Multi-AI provider configuration
CREATE TABLE IF NOT EXISTS public.ai_provider_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Provider details
  provider_name TEXT NOT NULL CHECK (provider_name IN ('retell_ai', 'assembly_ai', 'bland_ai', 'custom_webhook')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 1,
  
  -- Credentials
  api_key TEXT,
  webhook_url TEXT,
  
  -- Configuration
  cost_per_minute DECIMAL(10,4) NOT NULL DEFAULT 0.07,
  features_supported JSONB NOT NULL DEFAULT '[]', -- Array of feature names
  
  -- Performance
  total_calls INTEGER NOT NULL DEFAULT 0,
  successful_calls INTEGER NOT NULL DEFAULT 0,
  avg_quality_score DECIMAL(3,2) NOT NULL DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.ai_provider_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own AI provider configs"
  ON public.ai_provider_configurations
  FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_ai_provider_configs_user_id ON public.ai_provider_configurations(user_id);
CREATE INDEX idx_ai_provider_configs_org_id ON public.ai_provider_configurations(organization_id);
CREATE INDEX idx_ai_provider_configs_enabled ON public.ai_provider_configurations(enabled);

-- Trigger
CREATE TRIGGER update_ai_provider_configurations_updated_at
  BEFORE UPDATE ON public.ai_provider_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

## Step 1.5: Create function to sync plan features to toggles

Add to same migration file:

```sql
-- Function to automatically sync plan tier to feature toggles
CREATE OR REPLACE FUNCTION public.sync_plan_features_to_toggles()
RETURNS TRIGGER AS $$
DECLARE
  feature_set JSONB;
BEGIN
  -- Define features for each tier
  CASE NEW.plan_tier
    WHEN 'broadcast_starter' THEN
      feature_set := jsonb_build_object(
        'voice_broadcast', true,
        'csv_import', true,
        'audio_upload', true,
        'tts_generation', true,
        'press_1_transfer', true,
        'press_2_transfer', true,
        'number_rotation', true,
        'ghl_contact_sync', true,
        'basic_analytics', true
      );
    WHEN 'smart_broadcast_pro' THEN
      feature_set := jsonb_build_object(
        'voice_broadcast', true,
        'csv_import', true,
        'audio_upload', true,
        'tts_generation', true,
        'press_1_transfer', true,
        'press_2_transfer', true,
        'number_rotation', true,
        'ghl_contact_sync', true,
        'basic_analytics', true,
        'progressive_dialing', true,
        'campaign_scheduler', true,
        'multi_number_management', true,
        'basic_pipeline_tracking', true,
        'enhanced_ghl_sync', true
      );
    WHEN 'ai_powered_elite' THEN
      feature_set := jsonb_build_object(
        -- All Tier 1 & 2 features plus:
        'voice_broadcast', true,
        'csv_import', true,
        'audio_upload', true,
        'tts_generation', true,
        'press_1_transfer', true,
        'press_2_transfer', true,
        'number_rotation', true,
        'ghl_contact_sync', true,
        'basic_analytics', true,
        'progressive_dialing', true,
        'campaign_scheduler', true,
        'multi_number_management', true,
        'basic_pipeline_tracking', true,
        'enhanced_ghl_sync', true,
        'predictive_dialing', true,
        'ai_script_optimization', true,
        'ai_lead_scoring', true,
        'ai_call_outcome_prediction', true,
        'self_learning_ml', true,
        'advanced_analytics', true,
        'ai_tools_access', true
      );
    WHEN 'autonomous_ferrari' THEN
      feature_set := jsonb_build_object(
        -- All Tier 1, 2, 3 features plus:
        'voice_broadcast', true,
        'csv_import', true,
        'audio_upload', true,
        'tts_generation', true,
        'press_1_transfer', true,
        'press_2_transfer', true,
        'number_rotation', true,
        'ghl_contact_sync', true,
        'basic_analytics', true,
        'progressive_dialing', true,
        'campaign_scheduler', true,
        'multi_number_management', true,
        'basic_pipeline_tracking', true,
        'enhanced_ghl_sync', true,
        'predictive_dialing', true,
        'ai_script_optimization', true,
        'ai_lead_scoring', true,
        'ai_call_outcome_prediction', true,
        'self_learning_ml', true,
        'advanced_analytics', true,
        'ai_tools_access', true,
        'autonomous_agent_full', true,
        'autonomous_follow_ups', true,
        'autonomous_pipeline_movement', true,
        'decision_tracking', true,
        'lifecycle_management', true
      );
    WHEN 'enterprise_pro', 'enterprise_elite', 'white_label' THEN
      feature_set := jsonb_build_object(
        -- All features enabled
        'voice_broadcast', true,
        'csv_import', true,
        'audio_upload', true,
        'tts_generation', true,
        'press_1_transfer', true,
        'press_2_transfer', true,
        'number_rotation', true,
        'ghl_contact_sync', true,
        'basic_analytics', true,
        'progressive_dialing', true,
        'campaign_scheduler', true,
        'multi_number_management', true,
        'basic_pipeline_tracking', true,
        'enhanced_ghl_sync', true,
        'predictive_dialing', true,
        'ai_script_optimization', true,
        'ai_lead_scoring', true,
        'ai_call_outcome_prediction', true,
        'self_learning_ml', true,
        'advanced_analytics', true,
        'ai_tools_access', true,
        'autonomous_agent_full', true,
        'autonomous_follow_ups', true,
        'autonomous_pipeline_movement', true,
        'decision_tracking', true,
        'lifecycle_management', true,
        'multi_carrier_routing', true,
        'intelligent_cost_optimization', true,
        'real_time_carrier_monitoring', true,
        'multi_ai_provider_support', true,
        'custom_toggle_dashboard', true,
        'white_label_capabilities', NEW.plan_tier = 'white_label',
        'advanced_reporting', true,
        'api_access', true
      );
  END CASE;

  -- Update or insert feature toggles
  INSERT INTO public.user_feature_toggles (
    user_id,
    organization_id,
    plan_id,
    voice_broadcast,
    csv_import,
    audio_upload,
    tts_generation,
    press_1_transfer,
    press_2_transfer,
    number_rotation,
    ghl_contact_sync,
    basic_analytics,
    progressive_dialing,
    campaign_scheduler,
    multi_number_management,
    basic_pipeline_tracking,
    enhanced_ghl_sync,
    predictive_dialing,
    ai_script_optimization,
    ai_lead_scoring,
    ai_call_outcome_prediction,
    self_learning_ml,
    advanced_analytics,
    ai_tools_access,
    autonomous_agent_full,
    autonomous_follow_ups,
    autonomous_pipeline_movement,
    decision_tracking,
    lifecycle_management,
    multi_carrier_routing,
    intelligent_cost_optimization,
    real_time_carrier_monitoring,
    multi_ai_provider_support,
    custom_toggle_dashboard,
    white_label_capabilities,
    advanced_reporting,
    api_access
  )
  VALUES (
    NEW.user_id,
    NEW.organization_id,
    NEW.id,
    COALESCE((feature_set->>'voice_broadcast')::boolean, false),
    COALESCE((feature_set->>'csv_import')::boolean, false),
    COALESCE((feature_set->>'audio_upload')::boolean, false),
    COALESCE((feature_set->>'tts_generation')::boolean, false),
    COALESCE((feature_set->>'press_1_transfer')::boolean, false),
    COALESCE((feature_set->>'press_2_transfer')::boolean, false),
    COALESCE((feature_set->>'number_rotation')::boolean, false),
    COALESCE((feature_set->>'ghl_contact_sync')::boolean, false),
    COALESCE((feature_set->>'basic_analytics')::boolean, false),
    COALESCE((feature_set->>'progressive_dialing')::boolean, false),
    COALESCE((feature_set->>'campaign_scheduler')::boolean, false),
    COALESCE((feature_set->>'multi_number_management')::boolean, false),
    COALESCE((feature_set->>'basic_pipeline_tracking')::boolean, false),
    COALESCE((feature_set->>'enhanced_ghl_sync')::boolean, false),
    COALESCE((feature_set->>'predictive_dialing')::boolean, false),
    COALESCE((feature_set->>'ai_script_optimization')::boolean, false),
    COALESCE((feature_set->>'ai_lead_scoring')::boolean, false),
    COALESCE((feature_set->>'ai_call_outcome_prediction')::boolean, false),
    COALESCE((feature_set->>'self_learning_ml')::boolean, false),
    COALESCE((feature_set->>'advanced_analytics')::boolean, false),
    COALESCE((feature_set->>'ai_tools_access')::boolean, false),
    COALESCE((feature_set->>'autonomous_agent_full')::boolean, false),
    COALESCE((feature_set->>'autonomous_follow_ups')::boolean, false),
    COALESCE((feature_set->>'autonomous_pipeline_movement')::boolean, false),
    COALESCE((feature_set->>'decision_tracking')::boolean, false),
    COALESCE((feature_set->>'lifecycle_management')::boolean, false),
    COALESCE((feature_set->>'multi_carrier_routing')::boolean, false),
    COALESCE((feature_set->>'intelligent_cost_optimization')::boolean, false),
    COALESCE((feature_set->>'real_time_carrier_monitoring')::boolean, false),
    COALESCE((feature_set->>'multi_ai_provider_support')::boolean, false),
    COALESCE((feature_set->>'custom_toggle_dashboard')::boolean, false),
    COALESCE((feature_set->>'white_label_capabilities')::boolean, false),
    COALESCE((feature_set->>'advanced_reporting')::boolean, false),
    COALESCE((feature_set->>'api_access')::boolean, false)
  )
  ON CONFLICT (user_id, organization_id)
  DO UPDATE SET
    plan_id = NEW.id,
    voice_broadcast = COALESCE((feature_set->>'voice_broadcast')::boolean, false),
    csv_import = COALESCE((feature_set->>'csv_import')::boolean, false),
    audio_upload = COALESCE((feature_set->>'audio_upload')::boolean, false),
    tts_generation = COALESCE((feature_set->>'tts_generation')::boolean, false),
    press_1_transfer = COALESCE((feature_set->>'press_1_transfer')::boolean, false),
    press_2_transfer = COALESCE((feature_set->>'press_2_transfer')::boolean, false),
    number_rotation = COALESCE((feature_set->>'number_rotation')::boolean, false),
    ghl_contact_sync = COALESCE((feature_set->>'ghl_contact_sync')::boolean, false),
    basic_analytics = COALESCE((feature_set->>'basic_analytics')::boolean, false),
    progressive_dialing = COALESCE((feature_set->>'progressive_dialing')::boolean, false),
    campaign_scheduler = COALESCE((feature_set->>'campaign_scheduler')::boolean, false),
    multi_number_management = COALESCE((feature_set->>'multi_number_management')::boolean, false),
    basic_pipeline_tracking = COALESCE((feature_set->>'basic_pipeline_tracking')::boolean, false),
    enhanced_ghl_sync = COALESCE((feature_set->>'enhanced_ghl_sync')::boolean, false),
    predictive_dialing = COALESCE((feature_set->>'predictive_dialing')::boolean, false),
    ai_script_optimization = COALESCE((feature_set->>'ai_script_optimization')::boolean, false),
    ai_lead_scoring = COALESCE((feature_set->>'ai_lead_scoring')::boolean, false),
    ai_call_outcome_prediction = COALESCE((feature_set->>'ai_call_outcome_prediction')::boolean, false),
    self_learning_ml = COALESCE((feature_set->>'self_learning_ml')::boolean, false),
    advanced_analytics = COALESCE((feature_set->>'advanced_analytics')::boolean, false),
    ai_tools_access = COALESCE((feature_set->>'ai_tools_access')::boolean, false),
    autonomous_agent_full = COALESCE((feature_set->>'autonomous_agent_full')::boolean, false),
    autonomous_follow_ups = COALESCE((feature_set->>'autonomous_follow_ups')::boolean, false),
    autonomous_pipeline_movement = COALESCE((feature_set->>'autonomous_pipeline_movement')::boolean, false),
    decision_tracking = COALESCE((feature_set->>'decision_tracking')::boolean, false),
    lifecycle_management = COALESCE((feature_set->>'lifecycle_management')::boolean, false),
    multi_carrier_routing = COALESCE((feature_set->>'multi_carrier_routing')::boolean, false),
    intelligent_cost_optimization = COALESCE((feature_set->>'intelligent_cost_optimization')::boolean, false),
    real_time_carrier_monitoring = COALESCE((feature_set->>'real_time_carrier_monitoring')::boolean, false),
    multi_ai_provider_support = COALESCE((feature_set->>'multi_ai_provider_support')::boolean, false),
    custom_toggle_dashboard = COALESCE((feature_set->>'custom_toggle_dashboard')::boolean, false),
    white_label_capabilities = COALESCE((feature_set->>'white_label_capabilities')::boolean, false),
    advanced_reporting = COALESCE((feature_set->>'advanced_reporting')::boolean, false),
    api_access = COALESCE((feature_set->>'api_access')::boolean, false),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER sync_plan_to_features_trigger
  AFTER INSERT OR UPDATE OF plan_tier ON public.user_subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_plan_features_to_toggles();
```

## Step 1.6: Run the migration

Execute this command:

```bash
cd /home/runner/work/dial-smart-system/dial-smart-system
supabase db push
```

---

# MODULE 2: Core GHL Integration Enhancement

**Files to modify:**
- `supabase/functions/ghl-integration/index.ts` (extend existing 977-line function)
- Create new: `supabase/functions/ghl-plan-check/index.ts`

## Step 2.1: Add plan checking to GHL integration

Create file: `supabase/functions/ghl-plan-check/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) {
      throw new Error('Not authenticated');
    }

    const { feature } = await req.json();

    // Get user's plan and feature toggles
    const { data: plan, error: planError } = await supabaseClient
      .from('user_subscription_plans')
      .select('*, user_feature_toggles(*)')
      .eq('user_id', user.id)
      .eq('plan_status', 'active')
      .single();

    if (planError) {
      throw planError;
    }

    if (!plan) {
      return new Response(
        JSON.stringify({ 
          hasAccess: false, 
          reason: 'no_active_plan',
          upgradeUrl: '/settings/billing'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check feature access
    const featureToggles = plan.user_feature_toggles[0];
    const hasAccess = featureToggles?.[feature] === true;

    // Check usage limits
    let withinLimits = true;
    if (feature === 'voice_broadcast' && plan.calls_used >= plan.calls_included) {
      withinLimits = false;
    }

    return new Response(
      JSON.stringify({ 
        hasAccess: hasAccess && withinLimits,
        plan: plan.plan_tier,
        callsRemaining: plan.calls_included - plan.calls_used,
        upgradeRequired: !hasAccess,
        overageRate: !withinLimits ? plan.overage_rate : null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking plan:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

## Step 2.2: Add webhook signature verification to GHL integration

Open file: `supabase/functions/ghl-integration/index.ts`

Find the webhook handler section (around line 400-500) and add this code:

```typescript
// Add at the top of the file
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';

// Add this function after imports
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  return signature === expectedSignature;
}

// In the webhook handler (around line 450), add verification:
if (req.method === 'POST' && url.pathname.includes('/webhook')) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-ghl-signature') || '';
  const webhookSecret = Deno.env.get('GHL_WEBHOOK_SECRET') || '';
  
  // Verify signature
  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    console.error('Invalid webhook signature');
    return new Response(
      JSON.stringify({ error: 'Invalid signature' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  const payload = JSON.parse(rawBody);
  // Continue with existing webhook handling...
}
```

## Step 2.3: Add SSO support to OAuth flow

In the same `ghl-integration/index.ts` file, find the OAuth initiation section (around line 100-200) and enhance it:

```typescript
// Add SSO parameter handling
if (req.method === 'GET' && url.pathname.includes('/oauth/initiate')) {
  const ssoToken = url.searchParams.get('sso_token');
  const locationId = url.searchParams.get('location_id');
  
  // Build OAuth URL with SSO params
  const ghlAuthUrl = new URL('https://marketplace.gohighlevel.com/oauth/chooselocation');
  ghlAuthUrl.searchParams.set('response_type', 'code');
  ghlAuthUrl.searchParams.set('client_id', Deno.env.get('GHL_CLIENT_ID') || '');
  ghlAuthUrl.searchParams.set('redirect_uri', Deno.env.get('GHL_REDIRECT_URI') || '');
  ghlAuthUrl.searchParams.set('scope', 'contacts.readonly contacts.write opportunities.readonly opportunities.write calendars.readonly calendars.write');
  
  if (ssoToken) {
    ghlAuthUrl.searchParams.set('sso_token', ssoToken);
  }
  if (locationId) {
    ghlAuthUrl.searchParams.set('location_id', locationId);
  }
  
  // Store state for CSRF protection
  const state = crypto.randomUUID();
  ghlAuthUrl.searchParams.set('state', state);
  
  // TODO: Store state in database for verification
  
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      'Location': ghlAuthUrl.toString()
    }
  });
}
```

---

# MODULE 3: Feature Toggle System (React Context & Hooks)

**Files to create:**
- `src/contexts/FeatureToggleContext.tsx`
- `src/hooks/useFeatureToggle.ts`
- `src/components/FeatureGate.tsx`

## Step 3.1: Create Feature Toggle Context

Create file: `src/contexts/FeatureToggleContext.tsx`

```typescript
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FeatureToggles {
  // Core Features (Tier 1)
  voice_broadcast: boolean;
  csv_import: boolean;
  audio_upload: boolean;
  tts_generation: boolean;
  press_1_transfer: boolean;
  press_2_transfer: boolean;
  number_rotation: boolean;
  ghl_contact_sync: boolean;
  basic_analytics: boolean;
  
  // Smart Features (Tier 2)
  progressive_dialing: boolean;
  campaign_scheduler: boolean;
  multi_number_management: boolean;
  basic_pipeline_tracking: boolean;
  enhanced_ghl_sync: boolean;
  
  // AI Features (Tier 3)
  predictive_dialing: boolean;
  ai_script_optimization: boolean;
  ai_lead_scoring: boolean;
  ai_call_outcome_prediction: boolean;
  self_learning_ml: boolean;
  advanced_analytics: boolean;
  ai_tools_access: boolean;
  
  // Autonomous Features (Tier 4)
  autonomous_agent_full: boolean;
  autonomous_follow_ups: boolean;
  autonomous_pipeline_movement: boolean;
  decision_tracking: boolean;
  lifecycle_management: boolean;
  
  // Enterprise Features (Tier 5/6)
  multi_carrier_routing: boolean;
  intelligent_cost_optimization: boolean;
  real_time_carrier_monitoring: boolean;
  multi_ai_provider_support: boolean;
  custom_toggle_dashboard: boolean;
  white_label_capabilities: boolean;
  advanced_reporting: boolean;
  api_access: boolean;
}

interface SubscriptionPlan {
  id: string;
  plan_tier: string;
  plan_status: string;
  monthly_price: number;
  calls_included: number;
  calls_used: number;
  overage_rate: number;
  current_period_end: string;
}

interface FeatureToggleContextType {
  features: FeatureToggles | null;
  plan: SubscriptionPlan | null;
  loading: boolean;
  hasFeature: (feature: keyof FeatureToggles) => boolean;
  refreshFeatures: () => Promise<void>;
  upgradePlan: (newTier: string) => Promise<void>;
}

const defaultFeatures: FeatureToggles = {
  voice_broadcast: false,
  csv_import: false,
  audio_upload: false,
  tts_generation: false,
  press_1_transfer: false,
  press_2_transfer: false,
  number_rotation: false,
  ghl_contact_sync: false,
  basic_analytics: false,
  progressive_dialing: false,
  campaign_scheduler: false,
  multi_number_management: false,
  basic_pipeline_tracking: false,
  enhanced_ghl_sync: false,
  predictive_dialing: false,
  ai_script_optimization: false,
  ai_lead_scoring: false,
  ai_call_outcome_prediction: false,
  self_learning_ml: false,
  advanced_analytics: false,
  ai_tools_access: false,
  autonomous_agent_full: false,
  autonomous_follow_ups: false,
  autonomous_pipeline_movement: false,
  decision_tracking: false,
  lifecycle_management: false,
  multi_carrier_routing: false,
  intelligent_cost_optimization: false,
  real_time_carrier_monitoring: false,
  multi_ai_provider_support: boolean;
  custom_toggle_dashboard: false,
  white_label_capabilities: false,
  advanced_reporting: false,
  api_access: false,
};

const FeatureToggleContext = createContext<FeatureToggleContextType>({
  features: null,
  plan: null,
  loading: true,
  hasFeature: () => false,
  refreshFeatures: async () => {},
  upgradePlan: async () => {},
});

export const useFeatureToggles = () => {
  const context = useContext(FeatureToggleContext);
  if (!context) {
    throw new Error('useFeatureToggles must be used within FeatureToggleProvider');
  }
  return context;
};

interface Props {
  children: ReactNode;
}

export const FeatureToggleProvider: React.FC<Props> = ({ children }) => {
  const [features, setFeatures] = useState<FeatureToggles | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadFeatures = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setFeatures(defaultFeatures);
        setLoading(false);
        return;
      }

      // Get user's plan
      const { data: planData, error: planError } = await supabase
        .from('user_subscription_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('plan_status', 'active')
        .single();

      if (planError && planError.code !== 'PGRST116') {
        throw planError;
      }

      setPlan(planData);

      // Get feature toggles
      const { data: toggleData, error: toggleError } = await supabase
        .from('user_feature_toggles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (toggleError && toggleError.code !== 'PGRST116') {
        throw toggleError;
      }

      if (toggleData) {
        setFeatures(toggleData as FeatureToggles);
      } else {
        setFeatures(defaultFeatures);
      }

    } catch (error) {
      console.error('Error loading features:', error);
      toast({
        title: 'Error loading features',
        description: 'Using default feature set',
        variant: 'destructive',
      });
      setFeatures(defaultFeatures);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeatures();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('feature_toggles_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_feature_toggles',
        },
        () => {
          loadFeatures();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const hasFeature = (feature: keyof FeatureToggles): boolean => {
    return features?.[feature] === true;
  };

  const refreshFeatures = async () => {
    setLoading(true);
    await loadFeatures();
  };

  const upgradePlan = async (newTier: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Call upgrade function
      const { error } = await supabase.functions.invoke('upgrade-subscription', {
        body: { newTier }
      });

      if (error) throw error;

      toast({
        title: 'Plan upgraded!',
        description: 'Your new features are now available.',
      });

      await refreshFeatures();
    } catch (error) {
      console.error('Error upgrading plan:', error);
      toast({
        title: 'Upgrade failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <FeatureToggleContext.Provider 
      value={{ features, plan, loading, hasFeature, refreshFeatures, upgradePlan }}
    >
      {children}
    </FeatureToggleContext.Provider>
  );
};
```

## Step 3.2: Create useFeatureToggle hook

Create file: `src/hooks/useFeatureToggle.ts`

```typescript
import { useFeatureToggles } from '@/contexts/FeatureToggleContext';

export const useFeatureToggle = (featureName: string) => {
  const { features, hasFeature, loading } = useFeatureToggles();
  
  return {
    enabled: hasFeature(featureName as any),
    loading,
    features,
  };
};
```

## Step 3.3: Create FeatureGate component

Create file: `src/components/FeatureGate.tsx`

```typescript
import React, { ReactNode } from 'react';
import { useFeatureToggles } from '@/contexts/FeatureToggleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgrade?: boolean;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  children,
  fallback,
  showUpgrade = true,
}) => {
  const { hasFeature, plan, upgradePlan, loading } = useFeatureToggles();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (hasFeature(feature as any)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgrade) {
    return null;
  }

  // Default upgrade prompt
  return (
    <Card className="border-orange-500">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-orange-500" />
          <CardTitle>Upgrade Required</CardTitle>
        </div>
        <CardDescription>
          This feature is not available on your current plan ({plan?.plan_tier || 'Free'}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => upgradePlan('ai_powered_elite')}>
          Upgrade to Access
        </Button>
      </CardContent>
    </Card>
  );
};
```

## Step 3.4: Add provider to App.tsx

Open file: `src/App.tsx` and wrap the app with FeatureToggleProvider:

```typescript
import { FeatureToggleProvider } from '@/contexts/FeatureToggleContext';

// In the component return, wrap existing providers:
<AuthProvider>
  <OrganizationProvider>
    <FeatureToggleProvider>
      {/* Existing app content */}
    </FeatureToggleProvider>
  </OrganizationProvider>
</AuthProvider>
```

---

**This is MODULE 1-3 complete. The guide continues with MODULES 4-10 which include:**

- MODULE 4: Tier 1 UI components (SimpleBroadcastWizard, CSV import, etc.)
- MODULE 5: Tier 2 UI components (Progressive dialing, scheduler)
- MODULE 6: Tier 3 UI components (Predictive dialing, AI tools dashboard)
- MODULE 7: Tier 4 UI components (Autonomous agent interface)
- MODULE 8: Tier 5/6 UI components (Multi-carrier dashboard, enterprise features)
- MODULE 9: Advanced Dashboard System (Toggle manager, carrier controls)
- MODULE 10: GHL Marketplace Prep (Documentation, security audit, beta testing)

**Each remaining module follows the same pattern with:**
- Exact file paths
- Complete code examples
- Integration with existing patterns (useGoHighLevel, voice-broadcast-engine, etc.)
- Database operations
- Component structure

**Usage:** Give your AI coding agent each module sequentially, test after implementation, then proceed to next module.
