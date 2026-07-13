import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Phone, Play, Plus, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCurrentOrganizationId } from '@/contexts/OrganizationContext';
import { CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE } from '@/lib/launchSafety';

const QuickTestCampaign = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAction, setLastAction] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { toast } = useToast();
  const { userId } = useCurrentUser();
  const organizationId = useCurrentOrganizationId();

  useEffect(() => {
    setSelectedCampaign('');
    if (userId && organizationId) loadCampaigns();
    else setCampaigns([]);
  }, [userId, organizationId]);

  const loadCampaigns = async () => {
    if (!userId || !organizationId) return;
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, status, agent_id, provider, telnyx_assistant_id')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error: any) {
      console.error('Error loading campaigns:', error);
    }
  };

  const formatPhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return phone;
  };

  const addTestLead = async () => {
    if (!selectedCampaign || !testPhone) {
      toast({
        title: "Missing Info",
        description: "Please select a campaign and enter a phone number",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setLastAction(null);

    try {
      if (!userId) throw new Error('Not authenticated');
      if (!organizationId) throw new Error('Select a company before creating a test lead');

      const { data: ownedCampaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('id')
        .eq('id', selectedCampaign)
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (campaignError || !ownedCampaign) throw new Error('Campaign is not in the selected company');

      const formattedPhone = formatPhoneNumber(testPhone);

      // Check if lead already exists
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .eq('phone_number', formattedPhone)
        .maybeSingle();

      let leadId: string;

      if (existingLead) {
        leadId = existingLead.id;
        // Reset lead status for re-calling
        await supabase
          .from('leads')
          .update({ status: 'new' })
          .eq('id', leadId)
          .eq('organization_id', organizationId);
      } else {
        // Create new lead
        const { data: newLead, error: leadError } = await supabase
          .from('leads')
          .insert({
            user_id: userId,
            organization_id: organizationId,
            phone_number: formattedPhone,
            first_name: 'Test',
            last_name: 'Call',
            status: 'new'
          })
          .select()
          .maybeSingle();

        if (leadError) throw leadError;
        leadId = newLead.id;
      }

      // Check if already in campaign
      const { data: existingCampaignLead } = await supabase
        .from('campaign_leads')
        .select('id')
        .eq('campaign_id', selectedCampaign)
        .eq('lead_id', leadId)
        .maybeSingle();

      if (!existingCampaignLead) {
        // Add to campaign
        const { error: campaignLeadError } = await supabase
          .from('campaign_leads')
          .insert({
            campaign_id: selectedCampaign,
            lead_id: leadId
          });

        if (campaignLeadError) throw campaignLeadError;
      }

      // Launch safety: never recycle or delete a queue row from the browser.
      // The server-side campaign dispatcher owns the existing dialing state.
      setLastAction({ type: 'success', message: `Added ${formattedPhone} to campaign without changing its dialing state` });
      toast({
        title: "Test Lead Added",
        description: `${formattedPhone} was added. Any existing dialing state was left untouched for launch safety.`,
      });

    } catch (error: any) {
      console.error('Error adding test lead:', error);
      setLastAction({ type: 'error', message: error.message });
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const activateCampaignAndDispatch = async () => {
    if (!selectedCampaign) {
      toast({
        title: "No Campaign Selected",
        description: "Please select a campaign first",
        variant: "destructive"
      });
      return;
    }

    const launchLockMessage = CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE;
    setLastAction({ type: 'error', message: launchLockMessage });
    toast({
      title: 'Quick dispatch is launch-locked',
      description: launchLockMessage,
      variant: 'destructive',
    });
  };

  const selectedCampaignData = campaigns.find(c => c.id === selectedCampaign);

  return (
    <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Quick Test
        </CardTitle>
        <CardDescription>
          Lead setup is available; dispatch remains launch-locked until staging certification
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Campaign</Label>
            <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
              <SelectTrigger>
                <SelectValue placeholder="Select campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map(campaign => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    <div className="flex items-center gap-2">
                      <span>{campaign.name}</span>
                      <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                        {campaign.status}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Your Phone Number</Label>
            <Input
              type="tel"
              placeholder="(555) 123-4567"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </div>
        </div>

        {selectedCampaignData && !selectedCampaignData.agent_id && !selectedCampaignData.telnyx_assistant_id && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>Campaign has no agent assigned. Assign a Retell or Telnyx agent in Campaign settings.</span>
            </div>
          </div>
        )}

        {lastAction && (
          <div className={`flex items-center gap-2 p-2 rounded-lg ${
            lastAction.type === 'success' 
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' 
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
          }`}>
            {lastAction.type === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <span className="text-sm">{lastAction.message}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={addTestLead}
            disabled={isLoading || !organizationId || !selectedCampaign || !testPhone}
            className="flex-1"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add to Campaign
          </Button>
          <Button
            onClick={activateCampaignAndDispatch}
            disabled={isLoading || !organizationId || !selectedCampaign}
            className="flex-1"
          >
            <Play className="h-4 w-4 mr-2" />
            Activation Locked
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default QuickTestCampaign;
