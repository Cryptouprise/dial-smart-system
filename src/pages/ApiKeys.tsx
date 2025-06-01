
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import Navigation from '@/components/Navigation';

interface ApiCredentials {
  id: string;
  name: string;
  service: string;
  credentials: Record<string, string>;
  status: 'active' | 'inactive';
  created: string;
}

const ApiKeys = () => {
  const [apiCredentials, setApiCredentials] = useState<ApiCredentials[]>([
    {
      id: '1',
      name: 'Twilio Production',
      service: 'twilio',
      credentials: {
        accountSid: 'AC***************************',
        authToken: 'sk_test_***************************',
        phoneNumber: '+1234567890'
      },
      status: 'active',
      created: '2024-01-15'
    }
  ]);

  const [newCredentialName, setNewCredentialName] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [credentialFields, setCredentialFields] = useState<Record<string, string>>({});
  const [showCredentials, setShowCredentials] = useState<{ [key: string]: boolean }>({});
  const { toast } = useToast();

  const serviceConfigs = {
    twilio: {
      displayName: 'Twilio',
      fields: [
        { key: 'accountSid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
        { key: 'authToken', label: 'Auth Token', placeholder: 'Your Twilio Auth Token', type: 'password' },
        { key: 'phoneNumber', label: 'Phone Number', placeholder: '+1234567890' }
      ]
    },
    openai: {
      displayName: 'OpenAI',
      fields: [
        { key: 'apiKey', label: 'API Key', placeholder: 'sk-...', type: 'password' }
      ]
    },
    stripe: {
      displayName: 'Stripe',
      fields: [
        { key: 'publishableKey', label: 'Publishable Key', placeholder: 'pk_...' },
        { key: 'secretKey', label: 'Secret Key', placeholder: 'sk_...', type: 'password' }
      ]
    }
  };

  const handleServiceChange = (service: string) => {
    setSelectedService(service);
    setCredentialFields({});
  };

  const handleFieldChange = (fieldKey: string, value: string) => {
    setCredentialFields(prev => ({
      ...prev,
      [fieldKey]: value
    }));
  };

  const handleAddCredentials = () => {
    if (!newCredentialName || !selectedService) {
      toast({
        title: "Error",
        description: "Please enter a name and select a service",
        variant: "destructive"
      });
      return;
    }

    const serviceConfig = serviceConfigs[selectedService as keyof typeof serviceConfigs];
    const missingFields = serviceConfig.fields.filter(field => !credentialFields[field.key]);
    
    if (missingFields.length > 0) {
      toast({
        title: "Error",
        description: `Please fill in all required fields: ${missingFields.map(f => f.label).join(', ')}`,
        variant: "destructive"
      });
      return;
    }

    const newCredential: ApiCredentials = {
      id: Date.now().toString(),
      name: newCredentialName,
      service: selectedService,
      credentials: { ...credentialFields },
      status: 'active',
      created: new Date().toISOString().split('T')[0]
    };

    setApiCredentials([...apiCredentials, newCredential]);
    setNewCredentialName('');
    setSelectedService('');
    setCredentialFields({});

    toast({
      title: "Credentials Added",
      description: `Your ${serviceConfig.displayName} credentials have been saved successfully`,
    });
  };

  const handleDeleteCredentials = (id: string) => {
    setApiCredentials(apiCredentials.filter(cred => cred.id !== id));
    toast({
      title: "Credentials Deleted",
      description: "The credentials have been removed",
    });
  };

  const toggleCredentialVisibility = (id: string) => {
    setShowCredentials(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const maskCredential = (credential: string) => {
    if (credential.length <= 8) return credential;
    
    // For credentials longer than 12 characters, show first 8 and last 4 with asterisks in between
    if (credential.length > 12) {
      const maskedLength = credential.length - 12;
      return credential.substring(0, 8) + '*'.repeat(maskedLength) + credential.substring(credential.length - 4);
    }
    
    // For credentials between 8 and 12 characters, show first 4 and last 4 with asterisks in between
    const visibleChars = Math.min(4, Math.floor(credential.length / 3));
    const maskedLength = credential.length - (visibleChars * 2);
    return credential.substring(0, visibleChars) + '*'.repeat(Math.max(0, maskedLength)) + credential.substring(credential.length - visibleChars);
  };

  const getServiceDisplayName = (service: string) => {
    return serviceConfigs[service as keyof typeof serviceConfigs]?.displayName || service;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navigation />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">API Credentials Management</h1>

        {/* Add New Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Plus size={20} />
              <span>Add New API Credentials</span>
            </CardTitle>
            <CardDescription>Store your API credentials securely for integration with external services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="credentialName">Credential Set Name</Label>
                  <Input
                    id="credentialName"
                    placeholder="e.g., Twilio Production"
                    value={newCredentialName}
                    onChange={(e) => setNewCredentialName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service">Service</Label>
                  <Select value={selectedService} onValueChange={handleServiceChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(serviceConfigs).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedService && (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium text-gray-900">
                    {getServiceDisplayName(selectedService)} Credentials
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {serviceConfigs[selectedService as keyof typeof serviceConfigs].fields.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={field.key}>{field.label}</Label>
                        <Input
                          id={field.key}
                          type={field.type || 'text'}
                          placeholder={field.placeholder}
                          value={credentialFields[field.key] || ''}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button 
                onClick={handleAddCredentials} 
                disabled={!selectedService}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Add Credentials
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stored Credentials */}
        <Card>
          <CardHeader>
            <CardTitle>Stored API Credentials</CardTitle>
            <CardDescription>Manage your existing API credentials</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Credentials</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiCredentials.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        No API credentials stored yet. Add your first credentials above.
                      </TableCell>
                    </TableRow>
                  ) : (
                    apiCredentials.map((credential) => (
                      <TableRow key={credential.id}>
                        <TableCell className="font-medium">{credential.name}</TableCell>
                        <TableCell>{getServiceDisplayName(credential.service)}</TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            {Object.entries(credential.credentials).map(([key, value]) => (
                              <div key={key} className="flex items-center space-x-2 text-sm">
                                <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                                  {key}:
                                </span>
                                <span className="font-mono">
                                  {showCredentials[credential.id] ? value : maskCredential(value)}
                                </span>
                              </div>
                            ))}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCredentialVisibility(credential.id)}
                            >
                              {showCredentials[credential.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={credential.status === 'active' ? 'default' : 'secondary'}>
                            {credential.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{credential.created}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteCredentials(credential.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ApiKeys;
