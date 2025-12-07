-- Create lead scoring settings table
CREATE TABLE public.lead_scoring_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  
  -- Factor weights (must sum to 1.0)
  weight_recency NUMERIC NOT NULL DEFAULT 0.15,
  weight_call_history NUMERIC NOT NULL DEFAULT 0.20,
  weight_response_rate NUMERIC NOT NULL DEFAULT 0.15,
  weight_engagement NUMERIC NOT NULL DEFAULT 0.20,
  weight_sentiment NUMERIC NOT NULL DEFAULT 0.20,
  weight_manual_priority NUMERIC NOT NULL DEFAULT 0.10,
  
  -- Positive indicators (JSON array of keywords/phrases)
  positive_keywords JSONB NOT NULL DEFAULT '["interested", "yes", "tell me more", "sounds good", "great", "love it", "sign me up", "when can we start", "lets do it", "absolutely", "definitely", "perfect", "excited", "looking forward"]'::jsonb,
  
  -- Negative indicators (JSON array of keywords/phrases)
  negative_keywords JSONB NOT NULL DEFAULT '["not interested", "stop calling", "remove me", "no thanks", "busy", "wrong number", "do not call", "leave me alone", "unsubscribe", "scam", "spam", "go away", "hell no", "never"]'::jsonb,
  
  -- Neutral/Joke indicators (JSON array of keywords/phrases)
  neutral_keywords JSONB NOT NULL DEFAULT '["maybe", "i dont know", "perhaps", "let me think", "call back", "not now", "later", "haha", "lol", "funny", "joking", "kidding"]'::jsonb,
  
  -- Sentiment scoring adjustments
  positive_sentiment_bonus INTEGER NOT NULL DEFAULT 15,
  negative_sentiment_penalty INTEGER NOT NULL DEFAULT 25,
  neutral_sentiment_adjustment INTEGER NOT NULL DEFAULT 0,
  
  -- Engagement thresholds
  email_open_bonus INTEGER NOT NULL DEFAULT 10,
  sms_reply_bonus INTEGER NOT NULL DEFAULT 20,
  callback_request_bonus INTEGER NOT NULL DEFAULT 30,
  voicemail_left_penalty INTEGER NOT NULL DEFAULT 5,
  no_answer_penalty INTEGER NOT NULL DEFAULT 10,
  
  -- Response rate scoring
  quick_response_minutes INTEGER NOT NULL DEFAULT 30,
  quick_response_bonus INTEGER NOT NULL DEFAULT 15,
  
  -- Time decay settings
  days_before_score_decay INTEGER NOT NULL DEFAULT 14,
  decay_rate_per_day NUMERIC NOT NULL DEFAULT 2.0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_scoring_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own scoring settings"
ON public.lead_scoring_settings
FOR ALL
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_lead_scoring_settings_updated_at
BEFORE UPDATE ON public.lead_scoring_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();