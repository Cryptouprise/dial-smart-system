
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import Navigation from '@/components/Navigation';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  service: string;
  status: 'active' | 'inactive';
  created: string;
}

const ApiKeys = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([
    {
      id: '1',
      name: 'Twilio API',
      key: 'sk_test_***************************',
      service: 'SMS/Voice',
      status: 'active',
      created: '2024-01-15'
    }
  ]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyService, setNewKeyService] = useState('');
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const { toast } = useToast();

  const handleAddApiKey = () => {
    if (!newKeyName || !newKeyValue || !newKeyService) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    const newKey: ApiKey = {
      id: Date.now().toString(),
      name: newKeyName,
      key: newKeyValue,
      service: newKeyService,
      status: 'active',
      created: new Date().toISOString().split('T')[0]
    };

    setApiKeys([...apiKeys, newKey]);
    setNewKeyName('');
    setNewKeyValue('');
    setNewKeyService('');

    toast({
      title: "API Key Added",
      description: "Your API key has been saved successfully",
    });
  };

  const handleDeleteKey = (id: string) => {
    setApiKeys(apiKeys.filter(key => key.id !== id));
    toast({
      title: "API Key Deleted",
      description: "The API key has been removed",
    });
  };

  const toggleKeyVisibility = (id: string) => {
    setShowKeys(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return key;
    return key.substring(0, 8) + '*'.repeat(key.length - 12) + key.substring(key.length - 4);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navigation />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">API Keys Management</h1>

        {/* Add New API Key */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Plus size={20} />
              <span>Add New API Key</span>
            </CardTitle>
            <CardDescription>Store your API keys securely for integration with external services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <Label htmlFor="keyName">Key Name</Label>
                <Input
                  id="keyName"
                  placeholder="e.g., Twilio API"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="keyService">Service</Label>
                <Input
                  id="keyService"
                  placeholder="e.g., SMS/Voice"
                  value={newKeyService}
                  onChange={(e) => setNewKeyService(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="keyValue">API Key</Label>
                <Input
                  id="keyValue"
                  type="password"
                  placeholder="Enter your API key"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleAddApiKey} className="bg-blue-600 hover:bg-blue-700">
              Add API Key
            </Button>
          </CardContent>
        </Card>

        {/* API Keys List */}
        <Card>
          <CardHeader>
            <CardTitle>Stored API Keys</CardTitle>
            <CardDescription>Manage your existing API keys</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>API Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        No API keys stored yet. Add your first API key above.
                      </TableCell>
                    </TableRow>
                  ) : (
                    apiKeys.map((apiKey) => (
                      <TableRow key={apiKey.id}>
                        <TableCell className="font-medium">{apiKey.name}</TableCell>
                        <TableCell>{apiKey.service}</TableCell>
                        <TableCell className="font-mono">
                          <div className="flex items-center space-x-2">
                            <span>
                              {showKeys[apiKey.id] ? apiKey.key : maskKey(apiKey.key)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleKeyVisibility(apiKey.id)}
                            >
                              {showKeys[apiKey.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={apiKey.status === 'active' ? 'default' : 'secondary'}>
                            {apiKey.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{apiKey.created}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteKey(apiKey.id)}
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
