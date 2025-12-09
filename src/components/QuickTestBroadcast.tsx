import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Phone, Send, Loader2, Radio, CheckCircle } from 'lucide-react';

interface PhoneNumber {
  id: string;
  number: string;
  friendly_name: string | null;
  status: string;
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
        .select('id, number, friendly_name, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('is_spam', false)
        .order('number');

      if (error) throw error;

      setPhoneNumbers(data || []);
      if (data && data.length > 0) {
        setFormData(prev => ({ ...prev, fromNumber: data[0].number }));
      }
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
        description: "Please fill in all fields",
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
      toast({
        title: "Call Failed",
        description: error.message || "Failed to initiate test call",
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
          Send a test voice broadcast via Twilio to verify your setup
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
            <p>No active phone numbers available</p>
            <p className="text-sm">Add phone numbers in Number Management</p>
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
                This is the number that will appear on the recipient's caller ID
              </p>
            </div>

            {/* Destination Number */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Destination Number</Label>
              <Input
                value={formData.toNumber}
                onChange={(e) => setFormData({ ...formData, toNumber: e.target.value })}
                placeholder="Enter phone number"
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">
                The phone number that will receive the test call
              </p>
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
              <p className="text-xs text-muted-foreground">
                This message will be spoken via Twilio's text-to-speech (Polly.Joanna voice)
              </p>
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
                  <p><strong>Call SID:</strong> {callResult.callSid}</p>
                </div>
                <p className="text-sm mt-2 text-green-600 dark:text-green-400">
                  Check your phone! Press 1 when prompted to test the IVR.
                </p>
              </div>
            )}

            {/* Info Box */}
            <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <strong>How it works:</strong>
              <ul className="mt-1 space-y-1 list-disc list-inside">
                <li>Call goes through Twilio using your selected caller ID</li>
                <li>Recipient hears your message via text-to-speech</li>
                <li>After the message: Press 1 = Interested, Press 2 = Callback, Press 3 = Opt-out</li>
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default QuickTestBroadcast;
