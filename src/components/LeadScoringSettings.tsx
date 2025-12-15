import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useLeadScoringSettings } from '@/hooks/useLeadScoringSettings';
import { 
  Target, TrendingUp, TrendingDown, Minus, MessageSquare, Phone, 
  Mail, Clock, AlertCircle, Sparkles, X, Plus, RotateCcw, Save,
  ThumbsUp, ThumbsDown, Meh
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export const LeadScoringSettings: React.FC = () => {
  const { settings, isLoading, isSaving, saveSettings, updateSettings, resetToDefaults } = useLeadScoringSettings();
  const [newKeyword, setNewKeyword] = useState('');
  const [keywordType, setKeywordType] = useState<'positive' | 'negative' | 'neutral'>('positive');

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!settings) return null;

  const totalWeight = 
    settings.weight_recency + 
    settings.weight_call_history + 
    settings.weight_response_rate + 
    settings.weight_engagement + 
    settings.weight_sentiment + 
    settings.weight_manual_priority;

  const isWeightsValid = Math.abs(totalWeight - 1.0) < 0.01;

  const handleWeightChange = (key: keyof typeof settings, value: number) => {
    updateSettings({ [key]: value / 100 });
  };

  const addKeyword = () => {
    if (!newKeyword.trim()) return;
    
    const keywordKey = `${keywordType}_keywords` as 'positive_keywords' | 'negative_keywords' | 'neutral_keywords';
    const currentKeywords = settings[keywordKey];
    
    if (!currentKeywords.includes(newKeyword.trim().toLowerCase())) {
      updateSettings({ [keywordKey]: [...currentKeywords, newKeyword.trim().toLowerCase()] });
    }
    setNewKeyword('');
  };

  const removeKeyword = (type: 'positive' | 'negative' | 'neutral', keyword: string) => {
    const keywordKey = `${type}_keywords` as 'positive_keywords' | 'negative_keywords' | 'neutral_keywords';
    updateSettings({ 
      [keywordKey]: settings[keywordKey].filter(k => k !== keyword) 
    });
  };

  const handleSave = () => {
    saveSettings(settings);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Lead Scoring Configuration
            </CardTitle>
            <CardDescription>
              Customize how leads are prioritized based on engagement and sentiment
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetToDefaults} className="gap-1">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || !isWeightsValid} className="gap-1">
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="weights" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="weights">Weights</TabsTrigger>
            <TabsTrigger value="keywords">Keywords</TabsTrigger>
            <TabsTrigger value="engagement">Engagement</TabsTrigger>
            <TabsTrigger value="timing">Timing</TabsTrigger>
          </TabsList>

          {/* Weights Tab */}
          <TabsContent value="weights" className="space-y-6">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <AlertCircle className={`h-4 w-4 ${isWeightsValid ? 'text-green-500' : 'text-destructive'}`} />
              <span className="text-sm">
                Total weight: <strong className={isWeightsValid ? 'text-green-600' : 'text-destructive'}>
                  {(totalWeight * 100).toFixed(0)}%
                </strong>
                {!isWeightsValid && <span className="text-destructive ml-2">(must equal 100%)</span>}
              </span>
            </div>

            <div className="grid gap-6">
              {/* Recency Weight */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Recency (last contact)
                  </Label>
                  <span className="text-sm font-medium">{(settings.weight_recency * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[settings.weight_recency * 100]}
                  onValueChange={([v]) => handleWeightChange('weight_recency', v)}
                  max={50}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">How recently the lead was contacted</p>
              </div>

              {/* Call History Weight */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    Call History
                  </Label>
                  <span className="text-sm font-medium">{(settings.weight_call_history * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[settings.weight_call_history * 100]}
                  onValueChange={([v]) => handleWeightChange('weight_call_history', v)}
                  max={50}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">Previous call outcomes and attempts</p>
              </div>

              {/* Response Rate Weight */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Response Rate
                  </Label>
                  <span className="text-sm font-medium">{(settings.weight_response_rate * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[settings.weight_response_rate * 100]}
                  onValueChange={([v]) => handleWeightChange('weight_response_rate', v)}
                  max={50}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">Historical answer rates by area code</p>
              </div>

              {/* Engagement Weight */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    Engagement
                  </Label>
                  <span className="text-sm font-medium">{(settings.weight_engagement * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[settings.weight_engagement * 100]}
                  onValueChange={([v]) => handleWeightChange('weight_engagement', v)}
                  max={50}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">SMS replies, email opens, callbacks</p>
              </div>

              {/* Sentiment Weight */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    Sentiment Analysis
                  </Label>
                  <span className="text-sm font-medium">{(settings.weight_sentiment * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[settings.weight_sentiment * 100]}
                  onValueChange={([v]) => handleWeightChange('weight_sentiment', v)}
                  max={50}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">Language and psychological indicators</p>
              </div>

              {/* Manual Priority Weight */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    Manual Priority
                  </Label>
                  <span className="text-sm font-medium">{(settings.weight_manual_priority * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[settings.weight_manual_priority * 100]}
                  onValueChange={([v]) => handleWeightChange('weight_manual_priority', v)}
                  max={50}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">Your manual priority assignment (1-5)</p>
              </div>
            </div>
          </TabsContent>

          {/* Keywords Tab */}
          <TabsContent value="keywords" className="space-y-6">
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label>Add Keyword/Phrase</Label>
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="e.g., interested, sign me up"
                  onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  value={keywordType}
                  onChange={(e) => setKeywordType(e.target.value as any)}
                  className="h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="positive">Positive</option>
                  <option value="negative">Negative</option>
                  <option value="neutral">Neutral/Joke</option>
                </select>
              </div>
              <Button onClick={addKeyword} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <Accordion type="multiple" defaultValue={['positive', 'negative', 'neutral']} className="space-y-2">
              {/* Positive Keywords */}
              <AccordionItem value="positive" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-green-500" />
                    <span>Positive Indicators</span>
                    <Badge variant="secondary" className="ml-2">{settings.positive_keywords.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    Keywords that indicate interest or positive engagement (+{settings.positive_sentiment_bonus} points each)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {settings.positive_keywords.map((kw) => (
                      <Badge key={kw} variant="outline" className="bg-green-50 border-green-200 text-green-700 gap-1">
                        {kw}
                        <X 
                          className="h-3 w-3 cursor-pointer hover:text-destructive" 
                          onClick={() => removeKeyword('positive', kw)}
                        />
                      </Badge>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Negative Keywords */}
              <AccordionItem value="negative" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <ThumbsDown className="h-4 w-4 text-red-500" />
                    <span>Negative Indicators</span>
                    <Badge variant="secondary" className="ml-2">{settings.negative_keywords.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    Keywords that indicate disinterest or hostility (-{settings.negative_sentiment_penalty} points each)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {settings.negative_keywords.map((kw) => (
                      <Badge key={kw} variant="outline" className="bg-red-50 border-red-200 text-red-700 gap-1">
                        {kw}
                        <X 
                          className="h-3 w-3 cursor-pointer hover:text-destructive" 
                          onClick={() => removeKeyword('negative', kw)}
                        />
                      </Badge>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Neutral Keywords */}
              <AccordionItem value="neutral" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Meh className="h-4 w-4 text-yellow-500" />
                    <span>Neutral / Joking Indicators</span>
                    <Badge variant="secondary" className="ml-2">{settings.neutral_keywords.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    Keywords that indicate uncertainty or humor ({settings.neutral_sentiment_adjustment >= 0 ? '+' : ''}{settings.neutral_sentiment_adjustment} points each)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {settings.neutral_keywords.map((kw) => (
                      <Badge key={kw} variant="outline" className="bg-yellow-50 border-yellow-200 text-yellow-700 gap-1">
                        {kw}
                        <X 
                          className="h-3 w-3 cursor-pointer hover:text-destructive" 
                          onClick={() => removeKeyword('neutral', kw)}
                        />
                      </Badge>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Sentiment Scoring */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <Label className="text-xs">Positive Bonus</Label>
                <Input
                  type="number"
                  value={settings.positive_sentiment_bonus}
                  onChange={(e) => updateSettings({ positive_sentiment_bonus: parseInt(e.target.value) || 0 })}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Negative Penalty</Label>
                <Input
                  type="number"
                  value={settings.negative_sentiment_penalty}
                  onChange={(e) => updateSettings({ negative_sentiment_penalty: parseInt(e.target.value) || 0 })}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Neutral Adjustment</Label>
                <Input
                  type="number"
                  value={settings.neutral_sentiment_adjustment}
                  onChange={(e) => updateSettings({ neutral_sentiment_adjustment: parseInt(e.target.value) || 0 })}
                  className="h-9"
                />
              </div>
            </div>
          </TabsContent>

          {/* Engagement Tab */}
          <TabsContent value="engagement" className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email Open Bonus
                </Label>
                <Input
                  type="number"
                  value={settings.email_open_bonus}
                  onChange={(e) => updateSettings({ email_open_bonus: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Points for opening emails</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  SMS Reply Bonus
                </Label>
                <Input
                  type="number"
                  value={settings.sms_reply_bonus}
                  onChange={(e) => updateSettings({ sms_reply_bonus: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Points for replying to SMS</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Callback Request Bonus
                </Label>
                <Input
                  type="number"
                  value={settings.callback_request_bonus}
                  onChange={(e) => updateSettings({ callback_request_bonus: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Points for requesting callback</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  Voicemail Left Penalty
                </Label>
                <Input
                  type="number"
                  value={settings.voicemail_left_penalty}
                  onChange={(e) => updateSettings({ voicemail_left_penalty: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Points lost for voicemail</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Minus className="h-4 w-4 text-muted-foreground" />
                  No Answer Penalty
                </Label>
                <Input
                  type="number"
                  value={settings.no_answer_penalty}
                  onChange={(e) => updateSettings({ no_answer_penalty: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Points lost for no answer</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Quick Response Bonus
                </Label>
                <Input
                  type="number"
                  value={settings.quick_response_bonus}
                  onChange={(e) => updateSettings({ quick_response_bonus: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Points for fast responses</p>
              </div>
            </div>
          </TabsContent>

          {/* Timing Tab */}
          <TabsContent value="timing" className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Quick Response Window (minutes)
                </Label>
                <Input
                  type="number"
                  value={settings.quick_response_minutes}
                  onChange={(e) => updateSettings({ quick_response_minutes: parseInt(e.target.value) || 30 })}
                />
                <p className="text-xs text-muted-foreground">
                  Response within this time gets bonus points
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  Days Before Score Decay
                </Label>
                <Input
                  type="number"
                  value={settings.days_before_score_decay}
                  onChange={(e) => updateSettings({ days_before_score_decay: parseInt(e.target.value) || 14 })}
                />
                <p className="text-xs text-muted-foreground">
                  Score starts decaying after this many days
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Decay Rate (% per day)
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  value={settings.decay_rate_per_day}
                  onChange={(e) => updateSettings({ decay_rate_per_day: parseFloat(e.target.value) || 2 })}
                />
                <p className="text-xs text-muted-foreground">
                  How much the score decreases each day after decay starts
                </p>
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium text-sm mb-2">Score Decay Example</h4>
              <p className="text-xs text-muted-foreground">
                A lead with score 80, after {settings.days_before_score_decay} days of no contact, 
                will lose {settings.decay_rate_per_day}% per day. After 7 more days, 
                their score would be approximately {Math.round(80 * Math.pow(1 - settings.decay_rate_per_day / 100, 7))}.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
