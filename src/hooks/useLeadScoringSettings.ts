import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface LeadScoringSettings {
  id: string;
  user_id: string;
  weight_recency: number;
  weight_call_history: number;
  weight_response_rate: number;
  weight_engagement: number;
  weight_sentiment: number;
  weight_manual_priority: number;
  positive_keywords: string[];
  negative_keywords: string[];
  neutral_keywords: string[];
  positive_sentiment_bonus: number;
  negative_sentiment_penalty: number;
  neutral_sentiment_adjustment: number;
  email_open_bonus: number;
  sms_reply_bonus: number;
  callback_request_bonus: number;
  voicemail_left_penalty: number;
  no_answer_penalty: number;
  quick_response_minutes: number;
  quick_response_bonus: number;
  days_before_score_decay: number;
  decay_rate_per_day: number;
}

const defaultSettings: Omit<LeadScoringSettings, 'id' | 'user_id'> = {
  weight_recency: 0.15,
  weight_call_history: 0.20,
  weight_response_rate: 0.15,
  weight_engagement: 0.20,
  weight_sentiment: 0.20,
  weight_manual_priority: 0.10,
  positive_keywords: [
    "interested", "yes", "tell me more", "sounds good", "great", "love it",
    "sign me up", "when can we start", "lets do it", "absolutely", "definitely",
    "perfect", "excited", "looking forward"
  ],
  negative_keywords: [
    "not interested", "stop calling", "remove me", "no thanks", "busy",
    "wrong number", "do not call", "leave me alone", "unsubscribe", "scam",
    "spam", "go away", "hell no", "never"
  ],
  neutral_keywords: [
    "maybe", "i dont know", "perhaps", "let me think", "call back", "not now",
    "later", "haha", "lol", "funny", "joking", "kidding"
  ],
  positive_sentiment_bonus: 15,
  negative_sentiment_penalty: 25,
  neutral_sentiment_adjustment: 0,
  email_open_bonus: 10,
  sms_reply_bonus: 20,
  callback_request_bonus: 30,
  voicemail_left_penalty: 5,
  no_answer_penalty: 10,
  quick_response_minutes: 30,
  quick_response_bonus: 15,
  days_before_score_decay: 14,
  decay_rate_per_day: 2.0
};

export const useLeadScoringSettings = () => {
  const [settings, setSettings] = useState<LeadScoringSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('lead_scoring_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          ...data,
          positive_keywords: Array.isArray(data.positive_keywords) ? data.positive_keywords : JSON.parse(data.positive_keywords as string),
          negative_keywords: Array.isArray(data.negative_keywords) ? data.negative_keywords : JSON.parse(data.negative_keywords as string),
          neutral_keywords: Array.isArray(data.neutral_keywords) ? data.neutral_keywords : JSON.parse(data.neutral_keywords as string),
        });
      } else {
        // Return defaults for display, but don't save yet
        setSettings({
          id: '',
          user_id: user.id,
          ...defaultSettings
        });
      }
    } catch (error) {
      console.error('Error loading scoring settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = async (newSettings: Partial<LeadScoringSettings>) => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const settingsToSave = {
        user_id: user.id,
        ...newSettings,
        positive_keywords: JSON.stringify(newSettings.positive_keywords || settings?.positive_keywords),
        negative_keywords: JSON.stringify(newSettings.negative_keywords || settings?.negative_keywords),
        neutral_keywords: JSON.stringify(newSettings.neutral_keywords || settings?.neutral_keywords),
      };

      // Remove id if empty (for upsert)
      delete (settingsToSave as any).id;

      const { data, error } = await supabase
        .from('lead_scoring_settings')
        .upsert(settingsToSave, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;

      setSettings({
        ...data,
        positive_keywords: Array.isArray(data.positive_keywords) ? data.positive_keywords : JSON.parse(data.positive_keywords as string),
        negative_keywords: Array.isArray(data.negative_keywords) ? data.negative_keywords : JSON.parse(data.negative_keywords as string),
        neutral_keywords: Array.isArray(data.neutral_keywords) ? data.neutral_keywords : JSON.parse(data.neutral_keywords as string),
      });

      toast({
        title: 'Settings Saved',
        description: 'Lead scoring configuration updated successfully'
      });

      return data;
    } catch (error: any) {
      console.error('Error saving scoring settings:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save settings',
        variant: 'destructive'
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const updateSettings = (updates: Partial<LeadScoringSettings>) => {
    if (settings) {
      setSettings({ ...settings, ...updates });
    }
  };

  const resetToDefaults = () => {
    if (settings) {
      setSettings({
        ...settings,
        ...defaultSettings
      });
    }
  };

  // Analyze text for sentiment based on keywords
  const analyzeTextSentiment = (text: string): { sentiment: 'positive' | 'negative' | 'neutral'; score: number; matchedKeywords: string[] } => {
    if (!settings || !text) {
      return { sentiment: 'neutral', score: 0, matchedKeywords: [] };
    }

    const lowerText = text.toLowerCase();
    const matchedPositive = settings.positive_keywords.filter(kw => lowerText.includes(kw.toLowerCase()));
    const matchedNegative = settings.negative_keywords.filter(kw => lowerText.includes(kw.toLowerCase()));
    const matchedNeutral = settings.neutral_keywords.filter(kw => lowerText.includes(kw.toLowerCase()));

    const positiveScore = matchedPositive.length * settings.positive_sentiment_bonus;
    const negativeScore = matchedNegative.length * settings.negative_sentiment_penalty;
    const neutralScore = matchedNeutral.length * settings.neutral_sentiment_adjustment;

    const netScore = positiveScore - negativeScore + neutralScore;
    
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (matchedNegative.length > matchedPositive.length) {
      sentiment = 'negative';
    } else if (matchedPositive.length > matchedNegative.length) {
      sentiment = 'positive';
    }

    return {
      sentiment,
      score: netScore,
      matchedKeywords: [...matchedPositive, ...matchedNegative, ...matchedNeutral]
    };
  };

  return {
    settings,
    isLoading,
    isSaving,
    saveSettings,
    updateSettings,
    resetToDefaults,
    analyzeTextSentiment,
    defaultSettings
  };
};
