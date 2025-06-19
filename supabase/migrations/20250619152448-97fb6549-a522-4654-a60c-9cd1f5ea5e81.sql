
-- Create table for number rotation settings (move from localStorage to database)
CREATE TABLE public.rotation_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  rotation_interval_hours INTEGER NOT NULL DEFAULT 24,
  high_volume_threshold INTEGER NOT NULL DEFAULT 50,
  auto_import_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_remove_quarantined BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for rotation history tracking
CREATE TABLE public.rotation_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL, -- 'import', 'remove', 'rotate'
  phone_number TEXT,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for phone number purchasing orders
CREATE TABLE public.number_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  area_code TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  provider TEXT NOT NULL DEFAULT 'telnyx',
  total_cost DECIMAL(10,2),
  order_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create table for predictive dialing queues
CREATE TABLE public.dialing_queues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL,
  lead_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'calling', 'completed', 'failed'
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for system health monitoring
CREATE TABLE public.system_health_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'online', 'offline', 'degraded'
  response_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for Yellowstone integration settings
CREATE TABLE public.yellowstone_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  api_key_encrypted TEXT,
  webhook_url TEXT,
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 30,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add RLS policies for rotation_settings
ALTER TABLE public.rotation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own rotation settings" ON public.rotation_settings
  FOR ALL USING (auth.uid() = user_id);

-- Add RLS policies for rotation_history
ALTER TABLE public.rotation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own rotation history" ON public.rotation_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert rotation history" ON public.rotation_history
  FOR INSERT WITH CHECK (true);

-- Add RLS policies for number_orders
ALTER TABLE public.number_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own number orders" ON public.number_orders
  FOR ALL USING (auth.uid() = user_id);

-- Add RLS policies for dialing_queues
ALTER TABLE public.dialing_queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage dialing queues for their campaigns" ON public.dialing_queues
  FOR ALL USING (
    auth.uid() IN (
      SELECT user_id FROM campaigns WHERE id = dialing_queues.campaign_id
    )
  );

-- Add RLS policies for system_health_logs
ALTER TABLE public.system_health_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view system health logs" ON public.system_health_logs
  FOR SELECT USING (true);
CREATE POLICY "System can insert health logs" ON public.system_health_logs
  FOR INSERT WITH CHECK (true);

-- Add RLS policies for yellowstone_settings
ALTER TABLE public.yellowstone_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own Yellowstone settings" ON public.yellowstone_settings
  FOR ALL USING (auth.uid() = user_id);

-- Add foreign key constraints
ALTER TABLE public.dialing_queues 
ADD CONSTRAINT fk_dialing_queues_campaign 
FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.dialing_queues 
ADD CONSTRAINT fk_dialing_queues_lead 
FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_rotation_settings_user_id ON public.rotation_settings(user_id);
CREATE INDEX idx_rotation_history_user_id ON public.rotation_history(user_id);
CREATE INDEX idx_rotation_history_created_at ON public.rotation_history(created_at);
CREATE INDEX idx_number_orders_user_id ON public.number_orders(user_id);
CREATE INDEX idx_number_orders_status ON public.number_orders(status);
CREATE INDEX idx_dialing_queues_campaign_id ON public.dialing_queues(campaign_id);
CREATE INDEX idx_dialing_queues_status ON public.dialing_queues(status);
CREATE INDEX idx_dialing_queues_scheduled_at ON public.dialing_queues(scheduled_at);
CREATE INDEX idx_system_health_logs_service_name ON public.system_health_logs(service_name);
CREATE INDEX idx_system_health_logs_created_at ON public.system_health_logs(created_at);
CREATE INDEX idx_yellowstone_settings_user_id ON public.yellowstone_settings(user_id);

-- Add updated_at triggers
CREATE TRIGGER update_rotation_settings_updated_at
  BEFORE UPDATE ON public.rotation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dialing_queues_updated_at
  BEFORE UPDATE ON public.dialing_queues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yellowstone_settings_updated_at
  BEFORE UPDATE ON public.yellowstone_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
