import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Phone, Settings, Save, RefreshCw, Lock, MessageSquare, 
  Megaphone, Bot, Loader2 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PhoneNumber {
  id: string;
  number: string;
  friendly_name: string | null;
  provider: string;
  purpose: string;
  sip_trunk_provider: string | null;
  sip_trunk_config: any;
  is_stationary: boolean;
  status: string;
}

interface PhoneNumberClassifierProps {
  phoneNumber: PhoneNumber;
  onUpdate?: () => void;
}

export function PhoneNumberClassifier({ phoneNumber, onUpdate }: PhoneNumberClassifierProps) {
  const [provider, setProvider] = useState(phoneNumber.provider || 'twilio');
  const [purpose, setPurpose] = useState(phoneNumber.purpose || 'general_rotation');
  const [sipTrunkProvider, setSipTrunkProvider] = useState(phoneNumber.sip_trunk_provider || '');
  const [isStationary, setIsStationary] = useState(phoneNumber.is_stationary || false);
  const [retellPhoneId, setRetellPhoneId] = useState(phoneNumber.sip_trunk_config?.retell_phone_id || '');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const sipConfig: any = {};
      if (sipTrunkProvider === 'retell' && retellPhoneId) {
        sipConfig.retell_phone_id = retellPhoneId;
      }

      const { error } = await supabase
        .from('phone_numbers')
        .update({
          provider,
          purpose,
          sip_trunk_provider: sipTrunkProvider || null,
          sip_trunk_config: sipConfig,
          is_stationary: isStationary,
        })
        .eq('id', phoneNumber.id);

      if (error) throw error;

      toast({ title: 'Phone number settings saved' });
      onUpdate?.();
    } catch (error: any) {
      console.error('Error saving:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getPurposeIcon = () => {
    switch (purpose) {
      case 'broadcast': return <Megaphone className="h-4 w-4" />;
      case 'retell_agent': return <Bot className="h-4 w-4" />;
      case 'follow_up_dedicated': return <Lock className="h-4 w-4" />;
      case 'sms_only': return <MessageSquare className="h-4 w-4" />;
      default: return <RefreshCw className="h-4 w-4" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings className="h-5 w-5" />
          Configure {phoneNumber.number}
        </CardTitle>
        <CardDescription>
          Set provider, purpose, and SIP trunk configuration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider */}
        <div className="space-y-2">
          <Label>Provider (Where the number lives)</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="twilio">Twilio</SelectItem>
              <SelectItem value="telnyx">Telnyx</SelectItem>
              <SelectItem value="retell_native">Retell Native</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Purpose */}
        <div className="space-y-2">
          <Label>Purpose</Label>
          <Select value={purpose} onValueChange={setPurpose}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="broadcast">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4" />
                  Broadcast (Voice blasts, no AI)
                </div>
              </SelectItem>
              <SelectItem value="retell_agent">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Retell AI Agent (Conversational)
                </div>
              </SelectItem>
              <SelectItem value="follow_up_dedicated">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Follow-up Dedicated (No rotation)
                </div>
              </SelectItem>
              <SelectItem value="general_rotation">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  General Rotation
                </div>
              </SelectItem>
              <SelectItem value="sms_only">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  SMS Only
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* SIP Trunk Provider */}
        {(provider === 'twilio' || provider === 'telnyx') && purpose === 'retell_agent' && (
          <div className="space-y-2">
            <Label>SIP Trunk To</Label>
            <Select value={sipTrunkProvider} onValueChange={setSipTrunkProvider}>
              <SelectTrigger>
                <SelectValue placeholder="No SIP trunk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No SIP Trunk</SelectItem>
                <SelectItem value="retell">Retell AI</SelectItem>
              </SelectContent>
            </Select>
            {sipTrunkProvider === 'retell' && (
              <div className="mt-2 p-3 bg-muted rounded-lg space-y-2">
                <Label className="text-sm">Retell Phone Number ID</Label>
                <Input
                  value={retellPhoneId}
                  onChange={(e) => setRetellPhoneId(e.target.value)}
                  placeholder="Enter Retell phone number ID..."
                />
                <p className="text-xs text-muted-foreground">
                  This links your {provider} number to Retell via SIP trunk
                </p>
              </div>
            )}
          </div>
        )}

        {/* Stationary Toggle */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label>Stationary Number</Label>
              <p className="text-xs text-muted-foreground">
                Won't rotate - ideal for consistent follow-up sequences
              </p>
            </div>
          </div>
          <Switch checked={isStationary} onCheckedChange={setIsStationary} />
        </div>

        {/* Visual Summary */}
        <div className="flex items-center gap-2 p-3 border rounded-lg">
          <Phone className="h-5 w-5 text-muted-foreground" />
          <span className="font-mono">{phoneNumber.number}</span>
          <Badge variant="outline">{provider}</Badge>
          {sipTrunkProvider && (
            <>
              <span className="text-muted-foreground">→</span>
              <Badge variant="secondary">{sipTrunkProvider}</Badge>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {getPurposeIcon()}
            <Badge>{purpose.replace(/_/g, ' ')}</Badge>
          </div>
        </div>

        {/* Save Button */}
        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Configuration
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
