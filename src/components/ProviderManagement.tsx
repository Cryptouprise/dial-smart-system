/**
 * ProviderManagement Component
 * 
 * Admin UI for managing multi-carrier providers (Retell, Telnyx, Twilio).
 * Allows users to:
 * - Add and configure providers
 * - Test provider connections
 * - Import and manage phone numbers
 * - Set provider priority for routing
 * 
 * TODO: Complete implementation in PR E
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Phone, 
  Plus, 
  RefreshCw, 
  Settings, 
  Trash2, 
  CheckCircle, 
  XCircle,
  Loader2,
  MessageSquare,
  Shield,
  Voicemail
} from 'lucide-react';
import { useMultiCarrierProvider, type PhoneProvider } from '@/hooks/useMultiCarrierProvider';
import type { ProviderType } from '@/services/providers/types';

const PROVIDER_LABELS: Record<ProviderType, string> = {
  retell: 'Retell AI',
  telnyx: 'Telnyx',
  twilio: 'Twilio',
  custom: 'Custom',
};

const PROVIDER_DESCRIPTIONS: Record<ProviderType, string> = {
  retell: 'AI-powered voice conversations',
  telnyx: 'Voice, SMS, and RVM with STIR/SHAKEN',
  twilio: 'Voice and SMS with wide coverage',
  custom: 'Custom provider integration',
};

const CAPABILITY_ICONS: Record<string, React.ElementType> = {
  voice: Phone,
  sms: MessageSquare,
  rvm: Voicemail,
  shaken: Shield,
};

export const ProviderManagement: React.FC = () => {
  const {
    isLoading,
    providers,
    providerNumbers,
    listProviders,
    addProvider,
    updateProvider,
    deleteProvider,
    testConnection,
    listNumbers,
    importNumber,
    syncNumbers,
    getAvailableProviderTypes,
  } = useMultiCarrierProvider();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProviderType, setSelectedProviderType] = useState<ProviderType>('retell');
  const [displayName, setDisplayName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [priority, setPriority] = useState('1');
  const [importPhoneNumber, setImportPhoneNumber] = useState('');

  // Load providers and numbers on mount
  useEffect(() => {
    listProviders();
    listNumbers();
  }, [listProviders, listNumbers]);

  const handleAddProvider = async () => {
    const result = await addProvider(selectedProviderType, {
      display_name: displayName || PROVIDER_LABELS[selectedProviderType],
      api_key: apiKey,
      priority: parseInt(priority, 10),
      active: true,
    });

    if (result) {
      setIsAddDialogOpen(false);
      setDisplayName('');
      setApiKey('');
      setPriority('1');
    }
  };

  const handleToggleActive = async (provider: PhoneProvider) => {
    await updateProvider(provider.id, { active: !provider.active });
  };

  const handleTestConnection = async (providerType: ProviderType) => {
    await testConnection(providerType);
  };

  const handleImportNumber = async (providerType: ProviderType) => {
    if (!importPhoneNumber) return;
    await importNumber(providerType, importPhoneNumber);
    setImportPhoneNumber('');
  };

  const handleSyncNumbers = async (providerType: ProviderType) => {
    await syncNumbers(providerType);
  };

  const availableProviderTypes = getAvailableProviderTypes();
  const configuredProviderTypes = providers.map(p => p.name);
  const unconfiguredProviders = availableProviderTypes.filter(
    type => !configuredProviderTypes.includes(type)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Provider Management
              </CardTitle>
              <CardDescription>
                Configure and manage your telephony providers (Retell AI, Telnyx, Twilio)
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={unconfiguredProviders.length === 0}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Provider
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Provider</DialogTitle>
                  <DialogDescription>
                    Configure a new telephony provider for multi-carrier routing
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Provider Type</Label>
                    <Select
                      value={selectedProviderType}
                      onValueChange={(v) => setSelectedProviderType(v as ProviderType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {unconfiguredProviders.map((type) => (
                          <SelectItem key={type} value={type}>
                            {PROVIDER_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      {PROVIDER_DESCRIPTIONS[selectedProviderType]}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name (Optional)</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={PROVIDER_LABELS[selectedProviderType]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter API key"
                    />
                    <p className="text-sm text-muted-foreground">
                      Your API key will be stored securely
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority (1 = highest)</Label>
                    <Input
                      id="priority"
                      type="number"
                      min="1"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddProvider} disabled={isLoading}>
                    {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Provider
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Providers List */}
      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="numbers">Phone Numbers</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          {providers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No providers configured. Click "Add Provider" to get started.
              </CardContent>
            </Card>
          ) : (
            providers.map((provider) => (
              <Card key={provider.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {provider.display_name || PROVIDER_LABELS[provider.name]}
                          <Badge variant={provider.active ? 'default' : 'secondary'}>
                            {provider.active ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge variant="outline">Priority: {provider.priority}</Badge>
                        </CardTitle>
                        <CardDescription>
                          {PROVIDER_DESCRIPTIONS[provider.name]}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={provider.active}
                        onCheckedChange={() => handleToggleActive(provider)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(provider.name)}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        <span className="ml-1 hidden sm:inline">Test</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncNumbers(provider.name)}
                        disabled={isLoading}
                      >
                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        <span className="ml-1 hidden sm:inline">Sync</span>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteProvider(provider.id)}
                        disabled={isLoading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Enter phone number to import"
                        value={importPhoneNumber}
                        onChange={(e) => setImportPhoneNumber(e.target.value)}
                        className="w-64"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleImportNumber(provider.name)}
                        disabled={isLoading || !importPhoneNumber}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Import
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {providerNumbers.filter(n => n.provider_type === provider.name).length} numbers imported
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="numbers">
          <Card>
            <CardHeader>
              <CardTitle>Provider Phone Numbers</CardTitle>
              <CardDescription>
                All phone numbers imported from your configured providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {providerNumbers.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No phone numbers imported. Configure a provider and import numbers to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Capabilities</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Synced</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providerNumbers.map((number) => (
                      <TableRow key={number.id}>
                        <TableCell className="font-mono">{number.number}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {PROVIDER_LABELS[number.provider_type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {number.capabilities.map((cap) => {
                              const Icon = CAPABILITY_ICONS[cap] || Phone;
                              return (
                                <Badge key={cap} variant="secondary" className="gap-1">
                                  <Icon className="h-3 w-3" />
                                  {cap}
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {number.verified ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {number.last_synced
                            ? new Date(number.last_synced).toLocaleDateString()
                            : 'Never'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProviderManagement;
