-- Demo Platform Infrastructure Tables

-- Store demo agent configuration (admin-managed)
CREATE TABLE demo_agent_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retell_agent_id text NOT NULL,
  retell_llm_id text NOT NULL,
  demo_phone_number text NOT NULL,
  retell_phone_id text,
  base_prompt text NOT NULL,
  voice_id text DEFAULT '11labs-Sarah',
  is_active boolean DEFAULT true,
  max_calls_per_ip_per_day integer DEFAULT 3,
  max_calls_per_day integer DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Track demo sessions for analytics and flow state
CREATE TABLE demo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_url text,
  scraped_data jsonb,
  campaign_type text,
  simulation_config jsonb,
  prospect_phone text,
  prospect_name text,
  prospect_email text,
  ip_address text,
  user_agent text,
  call_initiated boolean DEFAULT false,
  call_completed boolean DEFAULT false,
  retell_call_id text,
  call_duration_seconds integer,
  call_recording_url text,
  simulation_started boolean DEFAULT false,
  simulation_completed boolean DEFAULT false,
  roi_viewed boolean DEFAULT false,
  cta_clicked text,
  converted_to_signup boolean DEFAULT false,
  projected_annual_savings numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Rate limiting and call tracking
CREATE TABLE demo_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES demo_sessions(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  ip_address text NOT NULL,
  retell_call_id text,
  status text DEFAULT 'initiated',
  error_message text,
  call_duration_seconds integer,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_demo_sessions_ip ON demo_sessions(ip_address);
CREATE INDEX idx_demo_sessions_created ON demo_sessions(created_at DESC);
CREATE INDEX idx_demo_call_logs_ip_date ON demo_call_logs(ip_address, created_at);
CREATE INDEX idx_demo_call_logs_session ON demo_call_logs(session_id);

-- Enable RLS
ALTER TABLE demo_agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_call_logs ENABLE ROW LEVEL SECURITY;

-- Demo tables are public-facing but controlled via edge functions
-- Only service role can insert/update, public can read limited data

-- Admin-only access for agent config
CREATE POLICY "Service role full access to demo_agent_config"
  ON demo_agent_config
  FOR ALL
  USING (auth.role() = 'service_role');

-- Public can create sessions (via edge function with service role)
CREATE POLICY "Service role full access to demo_sessions"
  ON demo_sessions
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to demo_call_logs"
  ON demo_call_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Insert default demo agent prompt template
INSERT INTO demo_agent_config (
  retell_agent_id,
  retell_llm_id, 
  demo_phone_number,
  base_prompt
) VALUES (
  'PENDING_SETUP',
  'PENDING_SETUP',
  'PENDING_SETUP',
  'You are an AI sales agent demonstrating Call Boss for {{business_name}}.

CONTEXT:
- This is a DEMO call to show a prospect what our AI can do
- The prospect runs {{business_name}} which offers: {{products_services}}
- They selected a "{{campaign_type}}" demo
- Your goal: Impress them with natural conversation in under 60 seconds

DEMO SCRIPT:

For database_reactivation:
"Hey! This is an AI calling on behalf of {{business_name}}. I noticed you were interested in {{products_services}} a while back but we never connected. I''m reaching out to see if that''s still something you''re looking for? We''ve got some great options available right now."

For speed_to_lead:
"Hi there! Thanks for checking out {{business_name}}! I saw you were just looking at our {{products_services}}. I wanted to reach out personally to see if you have any questions I can help with?"

For appointment_setter:
"Hello! I''m calling from {{business_name}}. We help businesses with {{products_services}}. Do you have 15 minutes this week for a quick call to see if we might be a good fit?"

RULES:
- Keep it SHORT - this is a demo, not a real sales call
- Be natural and conversational
- After 30-40 seconds, wrap up with: "This is just a quick demo of what Call Boss can do for you. Pretty cool, right? The full platform lets you make thousands of these calls automatically."
- End gracefully'
);