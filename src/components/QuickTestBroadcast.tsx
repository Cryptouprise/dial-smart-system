import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Phone, Send, Loader2, Radio, CheckCircle, ArrowRight, PhoneForwarded, Mic, Gauge } from 'lucide-react';

const ELEVENLABS_VOICES = [
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam ⭐' },
  { id: 'zrHiDhphv9ZnVXBqCLjz', name: 'Juniper ⭐' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily' },
];

interface PhoneNumber {
  id: string;
  number: string;
  friendly_name: string | null;
  status: string;
  provider: string | null;
}

const QuickTestBroadcast: React.FC = () => {
  const { toast } = useToast();
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [callResult, setCallResult] = useState<any>(null);

  const [formData, setFormData] = useState({
    toNumber: '214-529-1531',
    fromNumber: '',
    transferNumber: '',
    voiceId: 'TX3LPaxmHKxFdv7VOQHJ',
    speed: 1.0,
    message: 'Hello! This is a test call. We are selling solar panels in your area. Are you interested in saving money on your electricity bill?',
  });

  useEffect(() => {
    loadPhoneNumbers();
  }, []);

  const loadPhoneNumbers = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('phone_numbers')
        .select('id, number, friendly_name, status, provider')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('is_spam', false)
        .eq('provider', 'twilio')
        .order('number');

      if (error) throw error;

      setPhoneNumbers(data || []);
      // Don't auto-pick a "from" number; force the user to choose a valid Twilio caller ID.
      // This prevents accidental selection of an unverified/non-Twilio number.
      setFormData((prev) => ({ ...prev, fromNumber: '' }));
    } catch (error) {
      console.error('Error loading phone numbers:', error);
      toast({
        title: "Error",
        description: "Failed to load phone numbers",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestCall = async () => {
    if (!formData.toNumber || !formData.fromNumber || !formData.message) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsCalling(true);
    setCallResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('quick-test-call', {
        body: {
          toNumber: formData.toNumber,
          fromNumber: formData.fromNumber,
          message: formData.message,
          transferNumber: formData.transferNumber,
          voiceId: formData.voiceId,
          speed: formData.speed,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setCallResult(data);
      toast({
        title: "Call Initiated!",
        description: `Calling ${data.to} from ${data.from}. Check your phone!`,
      });

    } catch (error: any) {
      console.error('Test call error:', error);
      
      // Parse specific errors for better UX
      let errorMessage = error.message || "Failed to initiate test call";
      let errorTitle = "Call Failed";
      
      // Check for Twilio phone number errors
      const isTwilioVerificationError = errorMessage.includes('21210') || 
                                        errorMessage.includes('not yet verified') ||
                                        errorMessage.includes('not verified');
      const isTwilioInvalidNumber = errorMessage.includes('21214') || 
                                    errorMessage.includes('not valid');
      
      if (isTwilioVerificationError) {
        errorTitle = "Twilio Phone Number Not Verified";
        errorMessage = "This phone number is not verified or purchased in Twilio. Verify at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified";
      } else if (isTwilioInvalidNumber) {
        errorTitle = "Invalid Twilio Caller ID";
        errorMessage = "Invalid caller ID. Purchase a number at: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming";
      }
      
      // Check for ElevenLabs billing issues
      const isBillingIssue = errorMessage.toLowerCase().includes('payment') || 
                            errorMessage.toLowerCase().includes('subscription') ||
                            errorMessage.toLowerCase().includes('billing');
      const isQuotaIssue = errorMessage.toLowerCase().includes('quota') || 
                          errorMessage.toLowerCase().includes('limit');
      
      if (isBillingIssue) {
        errorTitle = "ElevenLabs Billing Issue";
        errorMessage = "ElevenLabs billing issue detected. Please update your payment at: https://elevenlabs.io/subscription";
      } else if (isQuotaIssue) {
        errorTitle = "ElevenLabs Quota Exceeded";
        errorMessage = "ElevenLabs quota exceeded. Upgrade at: https://elevenlabs.io/subscription";
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsCalling(false);
    }
  };

  const formatPhoneDisplay = (number: string) => {
    const clean = number.replace(/\D/g, '');
    if (clean.length === 11 && clean.startsWith('1')) {
      return `+1 (${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`;
    }
    if (clean.length === 10) {
      return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return number;
  };

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Radio className="h-5 w-5 text-primary" />
          Quick Test Broadcast
        </CardTitle>
        <CardDescription>
          Send a test voice broadcast via Twilio with IVR options
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
           ) : phoneNumbers.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No active Twilio phone numbers available</p>
              <p className="text-sm">Add/verify a Twilio number in Number Management</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/?tab=overview#phone-numbers">Manage phone numbers</Link>
                </Button>
              </div>
            </div>
        ) : (
          <>
            {/* Caller ID Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Caller ID (From Number)</Label>
              <Select
                value={formData.fromNumber}
                onValueChange={(value) => setFormData({ ...formData, fromNumber: value })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select caller ID" />
                </SelectTrigger>
                <SelectContent>
                  {phoneNumbers.map((phone) => (
                    <SelectItem key={phone.id} value={phone.number}>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-green-500" />
                        <span>{formatPhoneDisplay(phone.number)}</span>
                        {phone.friendly_name && (
                          <span className="text-muted-foreground text-xs">
                            ({phone.friendly_name})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This number will appear on the recipient's caller ID
              </p>
            </div>

            {/* Destination Number */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Destination Number</Label>
              <Input
                value={formData.toNumber}
                onChange={(e) => setFormData({ ...formData, toNumber: e.target.value })}
                placeholder="Enter phone number to call"
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">
                The phone number that will receive the test call
              </p>
            </div>

            {/* Transfer Number - NEW */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <PhoneForwarded className="h-4 w-4 text-blue-500" />
                Transfer Number (Press 1)
              </Label>
              <Input
                value={formData.transferNumber}
                onChange={(e) => setFormData({ ...formData, transferNumber: e.target.value })}
                placeholder="e.g., 469-555-1234 (your AI agent number)"
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">
                When recipient presses 1, they'll be transferred to this number (your Retell AI agent, etc.)
              </p>
            </div>

            {/* Voice Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Mic className="h-4 w-4 text-purple-500" />
                Voice (ElevenLabs)
              </Label>
              <Select
                value={formData.voiceId}
                onValueChange={(value) => setFormData({ ...formData, voiceId: value })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {ELEVENLABS_VOICES.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Speed Control */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4 text-blue-500" />
                Voice Speed: {formData.speed.toFixed(2)}x
              </Label>
              <Slider
                value={[formData.speed]}
                onValueChange={(values) => setFormData({ ...formData, speed: values[0] })}
                min={0.5}
                max={1.5}
                step={0.05}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Slower (0.5x)</span>
                <span>Normal (1.0x)</span>
                <span>Faster (1.5x)</span>
              </div>
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Broadcast Message</Label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Enter your test message..."
                rows={3}
                className="bg-background resize-none"
              />
            </div>

            {/* Call Button */}
            <Button 
              onClick={handleTestCall} 
              disabled={isCalling || !formData.fromNumber}
              className="w-full"
              size="lg"
            >
              {isCalling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Initiating Call...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Test Broadcast
                </>
              )}
            </Button>

            {/* Call Result */}
            {callResult && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Call Initiated Successfully!</span>
                </div>
                <div className="mt-2 text-sm text-muted-foreground space-y-1">
                  <p><strong>From:</strong> {formatPhoneDisplay(callResult.from)}</p>
                  <p><strong>To:</strong> {formatPhoneDisplay(callResult.to)}</p>
                  {callResult.transferNumber && (
                    <p><strong>Transfer To:</strong> {formatPhoneDisplay(callResult.transferNumber)}</p>
                  )}
                  <p><strong>Call SID:</strong> <span className="font-mono text-xs">{callResult.callSid}</span></p>
                </div>
                <p className="text-sm mt-2 text-green-600 dark:text-green-400">
                  Check your phone! Test the IVR options.
                </p>
              </div>
            )}

            {/* IVR Options Info */}
            <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-2">
              <p className="font-medium text-sm">IVR Options:</p>
              <div className="grid grid-cols-1 gap-1">
                <div className="flex items-center gap-2">
                  <span className="bg-primary/20 text-primary px-2 py-0.5 rounded font-mono">1</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span>{formData.transferNumber ? `Transfer to ${formatPhoneDisplay(formData.transferNumber)}` : 'Interest noted (no transfer configured)'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-yellow-500/20 text-yellow-600 px-2 py-0.5 rounded font-mono">2</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span>Schedule callback (24 hours)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-red-500/20 text-red-600 px-2 py-0.5 rounded font-mono">3</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span>Opt-out / Do Not Call</span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default QuickTestBroadcast;
