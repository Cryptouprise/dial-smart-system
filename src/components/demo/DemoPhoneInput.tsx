import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Phone,
  Loader2,
  AlertCircle,
  Sparkles,
  Bot,
  Zap,
  Clock,
  Brain,
  Scale,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DemoPhoneInputProps {
  sessionId: string | null;
  campaignType: string;
  scrapedData: any;
  prospectName: string;
  prospectCompany: string;
  prospectEmail: string;
  onProspectInfoChange: (name: string, company: string, email: string) => void;
  onCallInitiated: (callId: string) => void;
  onSkipCall: () => void;
  onBack: () => void;
}

const CAMPAIGN_LABELS: Record<string, string> = {
  database_reactivation: 'Database Reactivation',
  speed_to_lead: 'Speed to Lead',
  appointment_setter: 'Appointment Setter',
  cross_sell: 'Cross-sell / Upsell',
  reminder: 'Appointment Reminder',
  legal_after_hours: 'After-Hours Legal Intake',
};

export const DemoPhoneInput = ({
  sessionId,
  campaignType,
  scrapedData,
  prospectName,
  prospectCompany,
  prospectEmail,
  onProspectInfoChange,
  onCallInitiated,
  onSkipCall,
  onBack,
}: DemoPhoneInputProps) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const isLegalAfterHours = campaignType === 'legal_after_hours';

  const formatPhoneDisplay = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhoneNumber(digits);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (phoneNumber.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    if (!consent) {
      setError('Please agree to receive the demo call');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('demo-call', {
        body: {
          sessionId,
          phoneNumber: `+1${phoneNumber}`,
          campaignType,
          prospectName,
          prospectCompany,
          prospectEmail,
          consent: true,
        },
      });

      if (fnError) {
        let errorMessage = 'Failed to initiate call';
        let isLimitReached = false;

        try {
          const context = (fnError as any)?.context;
          if (context) {
            const responseBody = typeof context === 'string' ? JSON.parse(context) : context;
            errorMessage = responseBody?.error || errorMessage;
            isLimitReached = responseBody?.limitReached === true;
          }
        } catch {
          errorMessage = fnError.message || errorMessage;
        }

        if (isLimitReached) {
          setError('Demo call limit reached for today. Contact us for another personalized demo.');
          toast({
            title: 'Demo limit reached',
            description: 'This number or network has reached today\'s demo-call limit.',
          });
          return;
        }

        throw new Error(errorMessage);
      }

      if (!data?.success) {
        if (data?.limitReached) {
          setError('Demo call limit reached for today. Contact us for another personalized demo.');
          return;
        }
        throw new Error(data?.error || 'Failed to initiate call');
      }

      toast({
        title: '📞 Personalized call initiated!',
        description: isLegalAfterHours
          ? 'Answer the call and experience the after-hours intake conversation.'
          : 'You should receive your personalized Lady Jarvis call in a few seconds.',
      });

      onCallInitiated(data.callId);
    } catch (err: any) {
      console.error('Call error:', err);
      setError(err.message || 'Failed to initiate call. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const expectations = isLegalAfterHours
    ? [
        { icon: Scale, text: `Answers as ${scrapedData?.business_name || 'your firm'} after hours` },
        { icon: ClipboardList, text: 'Collects new-client intake one question at a time' },
        { icon: ShieldCheck, text: 'Uses legal-safe guardrails and flags urgency' },
      ]
    : [
        { icon: Zap, text: 'Call arrives in ~5 seconds' },
        { icon: Brain, text: 'AI uses the business context from your website' },
        { icon: Clock, text: 'Short personalized live demo conversation' },
      ];

  return (
    <div className="min-h-screen p-4 md:p-8 bg-background">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-violet-500/10 via-primary/5 to-cyan-500/10 rounded-3xl blur-2xl" />

          <div className="relative flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="rounded-full border border-border/50 hover:border-primary/50 hover:bg-primary/10 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-bold">
                {isLegalAfterHours ? 'Experience Your After-Hours Receptionist' : 'Experience It Yourself'}
              </h1>
              <p className="text-muted-foreground">
                {isLegalAfterHours ? (
                  <>
                    We&apos;ll call you so you can hear what a prospective client would experience when{' '}
                    <span className="text-primary font-semibold">{scrapedData?.business_name || 'your firm'}</span> is closed.
                  </>
                ) : (
                  <>
                    Get a real AI call personalized for{' '}
                    <span className="text-primary font-semibold">{scrapedData?.business_name || 'your business'}</span>.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {isLegalAfterHours && (
          <Card className="p-4 border-indigo-500/30 bg-indigo-500/5">
            <div className="flex gap-3">
              <Scale className="h-5 w-5 text-indigo-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Inbound roleplay, real phone call.</strong>{' '}
                The demo calls you only as the transport mechanism. Lady Jarvis will behave as though you called the law firm after hours.
              </div>
            </div>
          </Card>
        )}

        <div className="relative">
          <div className="absolute -inset-[2px] bg-gradient-to-r from-violet-500 via-primary to-cyan-500 rounded-2xl opacity-75 blur-sm animate-pulse" />
          <div className="absolute -inset-[1px] bg-gradient-to-r from-violet-500 via-primary to-cyan-500 rounded-2xl" />

          <Card className="relative p-6 md:p-8 space-y-6 bg-background/95 backdrop-blur-xl rounded-2xl border-0">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-400/50 animate-spin" style={{ animationDuration: '8s' }} />
                  <div className="absolute inset-1 rounded-full bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 blur-lg opacity-60 animate-pulse" />
                  <div className="absolute inset-2 rounded-full border border-violet-400/60 animate-spin" style={{ animationDuration: '4s', animationDirection: 'reverse' }} />
                  <div className="absolute inset-3 rounded-full bg-gradient-to-br from-violet-500 via-primary to-cyan-500 flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.5)]">
                    {isLegalAfterHours ? <Scale className="h-6 w-6 text-white" /> : <Phone className="h-6 w-6 text-white" />}
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold">
                  {isLegalAfterHours ? 'Tell Lady Jarvis who is calling' : 'Enter your details'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Lady Jarvis will demonstrate a{' '}
                  <span className="text-primary font-medium">{CAMPAIGN_LABELS[campaignType] || campaignType.replace(/_/g, ' ')}</span>{' '}
                  conversation.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">
                    {isLegalAfterHours ? 'Caller Name' : 'Your Name'}
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John"
                    value={prospectName}
                    onChange={(e) => onProspectInfoChange(e.target.value, prospectCompany, prospectEmail)}
                    className="h-12 bg-muted/50 border-2 border-primary/20 focus:border-primary/50 rounded-xl transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-sm font-medium">
                    {isLegalAfterHours ? 'Law Firm' : 'Company Name'}
                  </Label>
                  <Input
                    id="company"
                    type="text"
                    placeholder="Acme Inc"
                    value={prospectCompany}
                    readOnly={isLegalAfterHours}
                    onChange={(e) => onProspectInfoChange(prospectName, e.target.value, prospectEmail)}
                    className="h-12 bg-muted/50 border-2 border-primary/20 focus:border-primary/50 rounded-xl transition-all read-only:opacity-70"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={prospectEmail}
                  onChange={(e) => onProspectInfoChange(prospectName, prospectCompany, e.target.value)}
                  className="h-12 bg-muted/50 border-2 border-primary/20 focus:border-primary/50 rounded-xl transition-all"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">+1</span>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 555-5555"
                    value={formatPhoneDisplay(phoneNumber)}
                    onChange={handlePhoneChange}
                    className="pl-12 h-14 text-lg bg-muted/50 border-2 border-primary/20 focus:border-primary/50 rounded-xl transition-all font-medium"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <Checkbox
                  id="consent"
                  checked={consent}
                  onCheckedChange={(checked) => setConsent(checked as boolean)}
                  className="mt-0.5"
                />
                <label htmlFor="consent" className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
                  I agree to receive this AI demo call at the number above. The call is for demonstration purposes only.
                </label>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="relative group">
                <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 opacity-75 blur-sm animate-pulse" />
                <Button
                  type="submit"
                  size="lg"
                  className="relative w-full h-14 text-lg gap-2 bg-gradient-to-r from-violet-600 via-primary to-cyan-500 hover:opacity-90 transition-all hover:scale-[1.02] rounded-xl font-bold border-0"
                  disabled={isLoading || phoneNumber.length !== 10 || !consent}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Personalizing your call...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      {isLegalAfterHours ? 'Call Me — Run Legal Intake Demo' : 'Call Me Now'}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="text-center">
          <Button variant="ghost" onClick={onSkipCall} className="text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
            {isLegalAfterHours ? 'Skip call and see intake capabilities →' : 'Skip call and see simulation only →'}
          </Button>
        </div>

        <Card className="p-5 bg-background/50 backdrop-blur-sm border border-border/30 rounded-2xl">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            What to expect:
          </h3>
          <div className="grid gap-3">
            {expectations.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm text-foreground/80">{item.text}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};
