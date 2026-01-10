/**
 * TwilioNumbersOverview Component
 * 
 * Provides full transparency into ALL Twilio numbers and their webhook configurations.
 * Shows which numbers point to your app vs GHL vs elsewhere.
 * Includes Twilio number verification to ensure numbers actually exist in your account.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Phone, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  ExternalLink,
  Info,
  Search,
  Settings,
  Globe,
  Loader2,
  X,
  PhoneIncoming,
  ShieldCheck,
  ShieldX,
  Download,
  Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatPhoneNumber } from '@/lib/phoneUtils';

interface TwilioNumberDetail {
  sid: string;
  phone_number: string;
  friendly_name: string;
  sms_url: string | null;
  voice_url: string | null;
  capabilities: {
    sms: boolean;
    voice: boolean;
    mms: boolean;
  };
  status: string;
  // Derived fields
  webhook_destination: 'app' | 'ghl' | 'other' | 'none';
  in_app_database: boolean;
  // Verification fields from DB
  twilio_verified?: boolean;
  twilio_verified_at?: string;
  twilio_sid?: string;
}

const GHL_WEBHOOK_URL = 'https://services.msgsndr.com/conversations/providers/twilio/inbound_message';

const TwilioNumbersOverview: React.FC = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [numbers, setNumbers] = useState<TwilioNumberDetail[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNumbers, setSelectedNumbers] = useState<Set<string>>(new Set());
  const [showConfigureDialog, setShowConfigureDialog] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);
  const [revertAction, setRevertAction] = useState<'ghl' | 'clear'>('ghl');
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [appWebhookUrl, setAppWebhookUrl] = useState('');
  const [isConfiguringVoice, setIsConfiguringVoice] = useState(false);
  // Friendly name editing
  const [editingFriendlyName, setEditingFriendlyName] = useState<string | null>(null);
  const [friendlyNameValue, setFriendlyNameValue] = useState('');
  // Verification states
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRemovingInvalid, setIsRemovingInvalid] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  useEffect(() => {
    loadNumbers();
  }, []);

  const loadNumbers = async () => {
    setIsLoading(true);
    try {
      // Fetch all Twilio numbers with their webhook URLs
      const { data: twilioData, error: twilioError } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'check_a2p_status' }
      });

      if (twilioError) throw twilioError;

      // Get numbers that are in our database with verification status
      const { data: dbNumbers } = await supabase
        .from('phone_numbers')
        .select('number, twilio_verified, twilio_verified_at, twilio_sid');

      const dbNumberMap = new Map((dbNumbers || []).map(n => [n.number, n]));
      
      // Get the app's webhook URL
      const appUrl = `https://emonjusymdripmkvtttc.supabase.co/functions/v1/twilio-sms-webhook`;
      setAppWebhookUrl(appUrl);

      // Process numbers to determine webhook destination
      const processedNumbers: TwilioNumberDetail[] = (twilioData?.phone_numbers || []).map((num: any) => {
        let webhookDestination: 'app' | 'ghl' | 'other' | 'none' = 'none';
        
        if (num.sms_url) {
          if (num.sms_url.includes('supabase.co') || num.sms_url.includes('emonjusymdripmkvtttc')) {
            webhookDestination = 'app';
          } else if (num.sms_url.includes('gohighlevel') || num.sms_url.includes('highlevel') || num.sms_url.includes('msgsndr')) {
            webhookDestination = 'ghl';
          } else {
            webhookDestination = 'other';
          }
        }

        const dbInfo = dbNumberMap.get(num.phone_number);

        return {
          sid: num.sid,
          phone_number: num.phone_number,
          friendly_name: num.friendly_name || '',
          sms_url: num.sms_url || null,
          voice_url: num.voice_url || null,
          capabilities: num.capabilities || { sms: false, voice: false, mms: false },
          status: num.status || 'active',
          webhook_destination: webhookDestination,
          in_app_database: dbNumberMap.has(num.phone_number),
          twilio_verified: dbInfo?.twilio_verified,
          twilio_verified_at: dbInfo?.twilio_verified_at,
          twilio_sid: dbInfo?.twilio_sid,
        };
      });

      setNumbers(processedNumbers);
    } catch (error) {
      console.error('Failed to load numbers:', error);
      toast({
        title: 'Failed to Load Numbers',
        description: error instanceof Error ? error.message : 'Could not fetch Twilio numbers',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyAllNumbers = async () => {
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-phone-numbers', {
        body: { action: 'validate' }
      });

      if (error) throw error;

      toast({
        title: 'Verification Complete',
        description: `Checked ${data.summary.total_checked} numbers: ${data.summary.verified} verified, ${data.summary.not_found} not found in Twilio`,
      });

      await loadNumbers();
    } catch (error) {
      console.error('Verification failed:', error);
      toast({
        title: 'Verification Failed',
        description: error instanceof Error ? error.message : 'Could not verify numbers',
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const syncFromTwilio = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-phone-numbers', {
        body: { action: 'sync' }
      });

      if (error) throw error;

      if (data.summary.imported > 0) {
        toast({
          title: 'Sync Complete',
          description: `Imported ${data.summary.imported} new numbers from Twilio`,
        });
      } else {
        toast({
          title: 'Already Synced',
          description: 'All Twilio numbers are already in the database',
        });
      }

      await loadNumbers();
    } catch (error) {
      console.error('Sync failed:', error);
      toast({
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'Could not sync from Twilio',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const removeInvalidNumbers = async () => {
    setIsRemovingInvalid(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-phone-numbers', {
        body: { action: 'remove_invalid' }
      });

      if (error) throw error;

      toast({
        title: 'Cleanup Complete',
        description: data.removed > 0 
          ? `Removed ${data.removed} invalid numbers from database`
          : 'No invalid numbers to remove',
      });

      setShowRemoveDialog(false);
      await loadNumbers();
    } catch (error) {
      console.error('Remove failed:', error);
      toast({
        title: 'Cleanup Failed',
        description: error instanceof Error ? error.message : 'Could not remove invalid numbers',
        variant: 'destructive',
      });
    } finally {
      setIsRemovingInvalid(false);
    }
  };

  const configureSelectedNumbers = async (action: 'app' | 'ghl' | 'clear') => {
    if (selectedNumbers.size === 0) {
      toast({
        title: 'No Numbers Selected',
        description: 'Please select at least one number to configure',
        variant: 'destructive',
      });
      return;
    }

    setIsConfiguring(true);
    try {
      let edgeAction = '';
      let customWebhookUrl: string | undefined;
      
      if (action === 'app') {
        edgeAction = 'configure_selected_webhooks';
      } else if (action === 'ghl') {
        edgeAction = 'set_custom_webhook';
        customWebhookUrl = GHL_WEBHOOK_URL;
      } else {
        edgeAction = 'clear_selected_webhooks';
      }

      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { 
          action: edgeAction,
          phoneNumbers: Array.from(selectedNumbers),
          webhookUrl: customWebhookUrl
        }
      });

      if (error) throw error;

      const actionDescriptions = {
        app: `Successfully configured ${data.configured_count} numbers for this app`,
        ghl: `Successfully reverted ${data.configured_count} numbers to GoHighLevel`,
        clear: `Cleared webhooks on ${data.configured_count} numbers`
      };

      toast({
        title: action === 'app' ? 'Webhooks Configured' : action === 'ghl' ? 'Reverted to GHL' : 'Webhooks Cleared',
        description: actionDescriptions[action],
      });

      setSelectedNumbers(new Set());
      setShowConfigureDialog(false);
      setShowRevertDialog(false);
      await loadNumbers();
    } catch (error) {
      console.error('Failed to configure webhooks:', error);
      toast({
        title: 'Configuration Failed',
        description: error instanceof Error ? error.message : 'Could not configure webhooks',
        variant: 'destructive',
      });
    } finally {
      setIsConfiguring(false);
    }
  };

  const configureVoiceWebhooks = async () => {
    if (selectedNumbers.size === 0) {
      toast({
        title: 'No Numbers Selected',
        description: 'Please select at least one number to configure for inbound calls',
        variant: 'destructive',
      });
      return;
    }

    setIsConfiguringVoice(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { 
          action: 'configure_voice_webhook',
          phoneNumbers: Array.from(selectedNumbers)
        }
      });

      if (error) throw error;

      toast({
        title: 'Voice Webhooks Configured',
        description: `Configured ${data.configured_count} numbers for inbound calls. Callers will hear an IVR menu when calling back.`,
      });

      setSelectedNumbers(new Set());
      await loadNumbers();
    } catch (error) {
      console.error('Failed to configure voice webhooks:', error);
      toast({
        title: 'Configuration Failed',
        description: error instanceof Error ? error.message : 'Could not configure voice webhooks',
        variant: 'destructive',
      });
    } finally {
      setIsConfiguringVoice(false);
    }
  };

  const toggleNumberSelection = (phoneNumber: string) => {
    const newSelected = new Set(selectedNumbers);
    if (newSelected.has(phoneNumber)) {
      newSelected.delete(phoneNumber);
    } else {
      newSelected.add(phoneNumber);
    }
    setSelectedNumbers(newSelected);
  };

  const selectAllFiltered = () => {
    const filteredNums = filteredNumbers.map(n => n.phone_number);
    const newSelected = new Set([...selectedNumbers, ...filteredNums]);
    setSelectedNumbers(newSelected);
  };

  const deselectAll = () => {
    setSelectedNumbers(new Set());
  };

  const handleEditFriendlyName = (phoneNumber: string, currentName: string) => {
    setEditingFriendlyName(phoneNumber);
    setFriendlyNameValue(currentName || '');
  };

  const handleSaveFriendlyName = async (phoneNumber: string) => {
    try {
      // Save to local database
      const { error } = await supabase
        .from('phone_numbers')
        .update({ friendly_name: friendlyNameValue || null })
        .eq('number', phoneNumber);

      if (error) throw error;

      // Update local state
      setNumbers(prev => prev.map(n => 
        n.phone_number === phoneNumber 
          ? { ...n, friendly_name: friendlyNameValue }
          : n
      ));

      toast({
        title: 'Name Updated',
        description: `Friendly name saved for ${formatPhoneNumber(phoneNumber)}`,
      });

      setEditingFriendlyName(null);
      setFriendlyNameValue('');
    } catch (error) {
      console.error('Failed to save friendly name:', error);
      toast({
        title: 'Save Failed',
        description: 'Could not update the friendly name',
        variant: 'destructive',
      });
    }
  };

  const getDestinationBadge = (destination: TwilioNumberDetail['webhook_destination'], smsUrl: string | null) => {
    switch (destination) {
      case 'app':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  This App
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                <p className="font-mono text-xs break-all">{smsUrl}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'ghl':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="secondary" className="gap-1 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                  <ExternalLink className="h-3 w-3" />
                  GoHighLevel
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                <p className="font-mono text-xs break-all">{smsUrl}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'other':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="gap-1">
                  <Globe className="h-3 w-3" />
                  Other
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                <p className="font-mono text-xs break-all">{smsUrl}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      default:
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Not Configured
          </Badge>
        );
    }
  };

  const filteredNumbers = numbers.filter(num => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      num.phone_number.includes(term) ||
      num.friendly_name?.toLowerCase().includes(term)
    );
  });

  // Stats
  const stats = {
    total: numbers.length,
    pointingToApp: numbers.filter(n => n.webhook_destination === 'app').length,
    pointingToGHL: numbers.filter(n => n.webhook_destination === 'ghl').length,
    pointingToOther: numbers.filter(n => n.webhook_destination === 'other').length,
    notConfigured: numbers.filter(n => n.webhook_destination === 'none').length,
    inDatabase: numbers.filter(n => n.in_app_database).length,
    verified: numbers.filter(n => n.twilio_verified === true).length,
    unverified: numbers.filter(n => n.twilio_verified === false && n.twilio_verified_at).length,
    unchecked: numbers.filter(n => n.in_app_database && !n.twilio_verified_at).length,
  };

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
            <Info className="h-5 w-5" />
            Understanding SMS Webhooks
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
          <p>
            <strong>SMS Webhook</strong> determines where inbound SMS replies are sent. 
            When someone texts your Twilio number, Twilio forwards it to the configured webhook URL.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>This App:</strong> Replies come here and AI can auto-respond</li>
            <li><strong>GoHighLevel:</strong> Replies go to GHL's workflow/automation</li>
            <li><strong>Having BOTH is not possible</strong> - each number can only have ONE webhook destination</li>
          </ul>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Numbers</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-900">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.verified}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Verified
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.unverified}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <ShieldX className="h-3 w-3" /> Not in Twilio
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 dark:border-yellow-900">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.unchecked}</div>
            <div className="text-sm text-muted-foreground">Unchecked</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-900">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.pointingToApp}</div>
            <div className="text-sm text-muted-foreground">→ This App</div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 dark:border-orange-900">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-orange-600">{stats.pointingToGHL}</div>
            <div className="text-sm text-muted-foreground">→ GoHighLevel</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                All Twilio Numbers
              </CardTitle>
              <CardDescription>
                Complete view of all numbers with verification status and webhook destinations
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="default"
                size="sm"
                onClick={verifyAllNumbers}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-2" />
                )}
                Verify All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={syncFromTwilio}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Sync from Twilio
              </Button>
              {stats.unverified > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowRemoveDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove Invalid ({stats.unverified})
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={loadNumbers}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Actions */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by number or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedNumbers.size > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {selectedNumbers.size} selected
                  </span>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowConfigureDialog(true)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Route to This App
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/20"
                    onClick={() => {
                      setRevertAction('ghl');
                      setShowRevertDialog(true);
                    }}
                    disabled={isConfiguring}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Revert to GHL
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRevertAction('clear');
                      setShowRevertDialog(true);
                    }}
                    disabled={isConfiguring}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Clear (No Webhook)
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={configureVoiceWebhooks}
                    disabled={isConfiguringVoice}
                  >
                    {isConfiguringVoice ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <PhoneIncoming className="h-4 w-4 mr-2" />
                    )}
                    Enable Inbound Calls
                  </Button>
                </>
              )}
              {selectedNumbers.size === 0 && (
                <Button variant="outline" size="sm" onClick={selectAllFiltered}>
                  Select All Visible
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>SMS Webhook</TableHead>
                    <TableHead>Capabilities</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNumbers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? 'No numbers match your search' : 'No Twilio numbers found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredNumbers.map((num) => (
                      <TableRow key={num.sid}>
                        <TableCell>
                          <Checkbox
                            checked={selectedNumbers.has(num.phone_number)}
                            onCheckedChange={() => toggleNumberSelection(num.phone_number)}
                            disabled={!num.capabilities.sms}
                          />
                        </TableCell>
                        <TableCell className="font-mono">
                          {formatPhoneNumber(num.phone_number)}
                        </TableCell>
                        <TableCell>
                          {num.twilio_verified === true ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="default" className="gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                    <ShieldCheck className="h-3 w-3" />
                                    Verified
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Confirmed in Twilio account</p>
                                  {num.twilio_verified_at && (
                                    <p className="text-xs text-muted-foreground">
                                      Verified: {new Date(num.twilio_verified_at).toLocaleDateString()}
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : num.twilio_verified === false && num.twilio_verified_at ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="destructive" className="gap-1">
                                    <ShieldX className="h-3 w-3" />
                                    Not Found
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Not found in your Twilio account</p>
                                  <p className="text-xs">This number may not work for calls/SMS</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <Info className="h-3 w-3" />
                              Unchecked
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingFriendlyName === num.phone_number ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={friendlyNameValue}
                                onChange={(e) => setFriendlyNameValue(e.target.value)}
                                placeholder="e.g., Main Line"
                                className="h-7 w-32 text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveFriendlyName(num.phone_number);
                                  if (e.key === 'Escape') setEditingFriendlyName(null);
                                }}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleSaveFriendlyName(num.phone_number)}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setEditingFriendlyName(null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button 
                                    onClick={() => handleEditFriendlyName(num.phone_number, num.friendly_name)}
                                    className="text-left hover:text-primary transition-colors cursor-pointer"
                                  >
                                    {num.friendly_name || <span className="text-muted-foreground italic">Click to add name</span>}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Click to edit friendly name</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </TableCell>
                        <TableCell>
                          {num.capabilities.sms ? (
                            getDestinationBadge(num.webhook_destination, num.sms_url)
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              No SMS
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {num.capabilities.sms && (
                              <Badge variant="outline" className="text-xs">SMS</Badge>
                            )}
                            {num.capabilities.voice && (
                              <Badge variant="outline" className="text-xs">Voice</Badge>
                            )}
                            {num.capabilities.mms && (
                              <Badge variant="outline" className="text-xs">MMS</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configure Dialog */}
      <Dialog open={showConfigureDialog} onOpenChange={setShowConfigureDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Configure SMS Webhooks
            </DialogTitle>
            <DialogDescription>
              This will update {selectedNumbers.size} number(s) to send inbound SMS to this app.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Warning:</strong> If any of these numbers are currently sending SMS replies to GoHighLevel or another service, 
                those integrations will stop receiving messages. Only this app will receive them.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Selected Numbers:</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {Array.from(selectedNumbers).map(num => (
                  <div key={num} className="font-mono text-sm">{formatPhoneNumber(num)}</div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Webhook URL:</Label>
              <code className="block p-2 bg-muted rounded text-xs break-all">
                {appWebhookUrl}
              </code>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigureDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => configureSelectedNumbers('app')} disabled={isConfiguring}>
              {isConfiguring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Configuring...
                </>
              ) : (
                'Configure for This App'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revert Confirmation Dialog */}
      <Dialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {revertAction === 'ghl' ? (
                <>
                  <ExternalLink className="h-5 w-5 text-orange-500" />
                  Revert to GoHighLevel
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Clear Webhooks
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {revertAction === 'ghl' 
                ? 'This will send all inbound SMS replies for these numbers back to GoHighLevel.'
                : 'This will remove the webhook URL, so inbound SMS will not be forwarded anywhere.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {revertAction === 'ghl' ? (
              <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                <p className="text-sm text-orange-800 dark:text-orange-200 mb-2">
                  <strong>GoHighLevel Webhook URL:</strong>
                </p>
                <code className="block p-2 bg-white dark:bg-slate-900 rounded text-xs break-all border">
                  {GHL_WEBHOOK_URL}
                </code>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                  SMS replies will be sent to this URL and appear in your GHL conversations.
                </p>
              </div>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Warning:</strong> With no webhook configured, inbound SMS messages will not be forwarded anywhere. 
                  They may only be visible in your Twilio console logs.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Selected Numbers ({selectedNumbers.size}):</Label>
              <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1 bg-muted/50">
                {Array.from(selectedNumbers).map(num => (
                  <div key={num} className="font-mono text-sm">{formatPhoneNumber(num)}</div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRevertDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => configureSelectedNumbers(revertAction)} 
              disabled={isConfiguring}
              className={revertAction === 'ghl' ? 'bg-orange-600 hover:bg-orange-700' : ''}
              variant={revertAction === 'clear' ? 'secondary' : 'default'}
            >
              {isConfiguring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : revertAction === 'ghl' ? (
                'Revert to GoHighLevel'
              ) : (
                'Clear Webhooks'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Invalid Numbers Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Remove Invalid Numbers
            </DialogTitle>
            <DialogDescription>
              This will remove {stats.unverified} number(s) from your database that were not found in your Twilio account.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>Warning:</strong> These numbers are in your database but do NOT exist in your Twilio account. 
                They cannot be used for calls or SMS. Removing them will clean up your number pool.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={removeInvalidNumbers} 
              disabled={isRemovingInvalid}
            >
              {isRemovingInvalid ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove Invalid Numbers
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TwilioNumbersOverview;
