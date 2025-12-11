import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Phone, MessageSquare, Star, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PhoneNumber {
  id: string;
  number: string;
  friendly_name: string | null;
  provider: string;
  purpose: string;
  is_stationary: boolean;
  is_spam: boolean;
  status: string;
  sip_trunk_provider: string | null;
}

interface PoolEntry {
  id: string;
  phone_number_id: string;
  role: string;
  is_primary: boolean;
  priority: number;
  phone_numbers: PhoneNumber;
}

interface CampaignPhonePoolProps {
  campaignId: string;
  onUpdate?: () => void;
}

export function CampaignPhonePool({ campaignId, onUpdate }: CampaignPhonePoolProps) {
  const [poolEntries, setPoolEntries] = useState<PoolEntry[]>([]);
  const [availableNumbers, setAvailableNumbers] = useState<PhoneNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('outbound');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch pool entries for this campaign
      const { data: pool, error: poolError } = await supabase
        .from('campaign_phone_pools')
        .select(`
          *,
          phone_numbers(*)
        `)
        .eq('campaign_id', campaignId)
        .order('priority', { ascending: false });

      if (poolError) throw poolError;
      setPoolEntries(pool || []);

      // Fetch all user's phone numbers not already in pool
      const pooledIds = pool?.map(p => p.phone_number_id) || [];
      
      const { data: numbers, error: numbersError } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('status', 'active')
        .not('id', 'in', pooledIds.length > 0 ? `(${pooledIds.join(',')})` : '(00000000-0000-0000-0000-000000000000)');

      if (numbersError) throw numbersError;
      setAvailableNumbers(numbers || []);

    } catch (error: any) {
      console.error('Error fetching phone pool:', error);
      toast({
        title: 'Error',
        description: 'Failed to load phone pool',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (campaignId) {
      fetchData();
    }
  }, [campaignId]);

  const addToPool = async () => {
    if (!selectedNumber) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('campaign_phone_pools')
        .insert({
          campaign_id: campaignId,
          phone_number_id: selectedNumber,
          user_id: user.id,
          role: selectedRole,
          is_primary: poolEntries.length === 0,
          priority: poolEntries.length,
        });

      if (error) throw error;

      toast({ title: 'Number added to pool' });
      setSelectedNumber('');
      fetchData();
      onUpdate?.();
    } catch (error: any) {
      console.error('Error adding to pool:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const removeFromPool = async (entryId: string) => {
    try {
      const { error } = await supabase
        .from('campaign_phone_pools')
        .delete()
        .eq('id', entryId);

      if (error) throw error;

      toast({ title: 'Number removed from pool' });
      fetchData();
      onUpdate?.();
    } catch (error: any) {
      console.error('Error removing from pool:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const setPrimary = async (entryId: string) => {
    try {
      // First, unset all primaries
      await supabase
        .from('campaign_phone_pools')
        .update({ is_primary: false })
        .eq('campaign_id', campaignId);

      // Then set the new primary
      const { error } = await supabase
        .from('campaign_phone_pools')
        .update({ is_primary: true })
        .eq('id', entryId);

      if (error) throw error;

      toast({ title: 'Primary number updated' });
      fetchData();
    } catch (error: any) {
      console.error('Error setting primary:', error);
    }
  };

  const updateRole = async (entryId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('campaign_phone_pools')
        .update({ role })
        .eq('id', entryId);

      if (error) throw error;
      fetchData();
    } catch (error: any) {
      console.error('Error updating role:', error);
    }
  };

  const getProviderBadge = (number: PhoneNumber) => {
    const colors: Record<string, string> = {
      twilio: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      telnyx: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      retell_native: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    };

    let label = number.provider || 'unknown';
    if (number.sip_trunk_provider) {
      label = `${number.provider} → ${number.sip_trunk_provider}`;
    }

    return (
      <Badge variant="outline" className={colors[number.provider] || ''}>
        {label}
      </Badge>
    );
  };

  const getPurposeBadge = (purpose: string) => {
    const config: Record<string, { label: string; icon: any }> = {
      broadcast: { label: 'Broadcast', icon: Phone },
      retell_agent: { label: 'AI Agent', icon: MessageSquare },
      follow_up_dedicated: { label: 'Follow-up', icon: Lock },
      general_rotation: { label: 'Rotation', icon: RefreshCw },
      sms_only: { label: 'SMS Only', icon: MessageSquare },
    };

    const { label, icon: Icon } = config[purpose] || { label: purpose, icon: Phone };

    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Campaign Phone Pool
        </CardTitle>
        <CardDescription>
          Assign phone numbers to this campaign. Stationary numbers won't rotate and are ideal for follow-ups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Number Form */}
        <div className="flex gap-2">
          <Select value={selectedNumber} onValueChange={setSelectedNumber}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a number to add..." />
            </SelectTrigger>
            <SelectContent>
              {availableNumbers.map((num) => (
                <SelectItem key={num.id} value={num.id}>
                  <div className="flex items-center gap-2">
                    <span>{num.number}</span>
                    {num.is_spam && <AlertTriangle className="h-3 w-3 text-destructive" />}
                    <span className="text-muted-foreground text-xs">({num.provider})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outbound">Outbound</SelectItem>
              <SelectItem value="caller_id_only">Caller ID Only</SelectItem>
              <SelectItem value="sms_only">SMS Only</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={addToPool} disabled={!selectedNumber}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Pool Table */}
        {poolEntries.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Primary</TableHead>
                <TableHead>Stationary</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {poolEntries.map((entry) => (
                <TableRow key={entry.id} className={entry.phone_numbers?.is_spam ? 'bg-destructive/10' : ''}>
                  <TableCell className="font-mono">
                    <div className="flex items-center gap-2">
                      {entry.phone_numbers?.number}
                      {entry.phone_numbers?.is_spam && (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getProviderBadge(entry.phone_numbers)}
                  </TableCell>
                  <TableCell>
                    {getPurposeBadge(entry.phone_numbers?.purpose || 'general_rotation')}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={entry.role}
                      onValueChange={(value) => updateRole(entry.id, value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outbound">Outbound</SelectItem>
                        <SelectItem value="caller_id_only">Caller ID</SelectItem>
                        <SelectItem value="sms_only">SMS Only</SelectItem>
                        <SelectItem value="inbound">Inbound</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={entry.is_primary ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setPrimary(entry.id)}
                    >
                      <Star className={`h-4 w-4 ${entry.is_primary ? 'fill-current' : ''}`} />
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.phone_numbers?.is_stationary ? 'default' : 'outline'}>
                      {entry.phone_numbers?.is_stationary ? (
                        <><Lock className="h-3 w-3 mr-1" /> Stationary</>
                      ) : (
                        'Rotating'
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFromPool(entry.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Phone className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No numbers assigned to this campaign</p>
            <p className="text-sm">Add numbers above to enable calling</p>
          </div>
        )}

        {/* Warnings */}
        {poolEntries.some(e => e.phone_numbers?.is_spam) && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>Some numbers in this pool are flagged as spam. Consider removing them.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
