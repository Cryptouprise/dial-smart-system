import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Phone, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DemoPhoneInputProps {
  sessionId: string | null;
  campaignType: string;
  scrapedData: any;
  onCallInitiated: (callId: string) => void;
  onSkipCall: () => void;
  onBack: () => void;
}

export const DemoPhoneInput = ({
  sessionId,
  campaignType,
  scrapedData,
  onCallInitiated,
  onSkipCall,
  onBack,
}: DemoPhoneInputProps) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

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
        },
      });

      if (fnError || !data?.success) {
        if (data?.limitReached) {
          toast({
            title: 'Demo limit reached',
            description: 'You can try again tomorrow or sign up for full access!',
            variant: 'destructive',
          });
        }
        throw new Error(data?.error || fnError?.message || 'Failed to initiate call');
      }

      toast({
        title: '📞 Call initiated!',
        description: 'You should receive a call in a few seconds.',
      });

      onCallInitiated(data.callId);
    } catch (err: any) {
      console.error('Call error:', err);
      setError(err.message || 'Failed to initiate call');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Experience It Yourself</h1>
            <p className="text-muted-foreground">
              Get a real AI call for {scrapedData?.business_name || 'your business'}
            </p>
          </div>
        </div>

        {/* Phone Input Card */}
        <Card className="p-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
              <Phone className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Enter your phone number</h2>
            <p className="text-sm text-muted-foreground">
              Our AI will call you and demonstrate a {campaignType.replace(/_/g, ' ')} conversation
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  +1
                </span>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 555-5555"
                  value={formatPhoneDisplay(phoneNumber)}
                  onChange={handlePhoneChange}
                  className="pl-10 h-12 text-lg"
                  autoComplete="tel"
                />
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(checked) => setConsent(checked as boolean)}
              />
              <label htmlFor="consent" className="text-sm text-muted-foreground cursor-pointer">
                I agree to receive a demo call from an AI agent. This call is for demonstration 
                purposes only and will last about 30-60 seconds.
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            <Button 
              type="submit" 
              size="lg" 
              className="w-full gap-2"
              disabled={isLoading || phoneNumber.length !== 10 || !consent}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calling you now...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Call Me Now
                </>
              )}
            </Button>
          </form>
        </Card>

        {/* Skip Option */}
        <div className="text-center">
          <Button variant="link" onClick={onSkipCall} className="text-muted-foreground">
            Skip call and see simulation only
          </Button>
        </div>

        {/* What to Expect */}
        <Card className="p-4 bg-muted/30">
          <h3 className="font-medium mb-2">What to expect:</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• You'll receive a call from our AI in ~5 seconds</li>
            <li>• The AI knows about your business from the website scan</li>
            <li>• The call will demonstrate a {campaignType.replace(/_/g, ' ')} scenario</li>
            <li>• Duration: 30-60 seconds</li>
          </ul>
        </Card>
      </div>
    </div>
  );
};
