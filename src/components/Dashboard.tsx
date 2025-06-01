
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useRetellAI } from '@/hooks/useRetellAI';
import { RefreshCw } from 'lucide-react';
import Navigation from '@/components/Navigation';
import SpamDetectionManager from '@/components/SpamDetectionManager';
import NumberRotationManager from '@/components/NumberRotationManager';
import CallAnalytics from '@/components/CallAnalytics';
import AutomationEngine from '@/components/AutomationEngine';
import AlertSystem from '@/components/AlertSystem';
import SystemHealthDashboard from '@/components/SystemHealthDashboard';
import AIDecisionEngine from '@/components/AIDecisionEngine';
import YellowstoneManager from '@/components/YellowstoneManager';

interface PhoneNumber {
  id: string;
  number: string;
  area_code: string;
  daily_calls: number;
  status: 'active' | 'quarantined' | 'cooldown';
  quarantine_until?: string;
  is_spam: boolean;
  last_used?: string;
  created_at: string;
  updated_at: string;
}

const Dashboard = () => {
  const [newAreaCode, setNewAreaCode] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [integrationStatus, setIntegrationStatus] = useState({
    twilio: false,
    retell: false,
    openai: false,
    stripe: false
  });
  const [retellUri, setRetellUri] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { importPhoneNumber, isLoading: retellLoading } = useRetellAI();

  // Add the missing onRefreshNumbers function
  const onRefreshNumbers = () => {
    queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
  };

  // Check authentication status
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        console.log('Initial session check:', currentSession);
        
        if (currentSession) {
          setSession(currentSession);
          setUser(currentSession.user);
          checkIntegrationStatus();
        } else {
          console.log('No session found, redirecting to auth');
          navigate('/auth');
          return;
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        navigate('/auth');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user);
      setSession(session);
      setUser(session?.user || null);
      
      if (event === 'SIGNED_IN') {
        console.log('User signed in, updating state');
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        console.log('User signed out, redirecting');
        navigate('/auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Check integration status
  const checkIntegrationStatus = () => {
    const storedCredentials = localStorage.getItem('api-credentials');
    if (storedCredentials) {
      try {
        const credentials = JSON.parse(storedCredentials);
        setIntegrationStatus({
          twilio: credentials.some((c: any) => c.service === 'twilio'),
          retell: credentials.some((c: any) => c.service === 'retell'),
          openai: credentials.some((c: any) => c.service === 'openai'),
          stripe: credentials.some((c: any) => c.service === 'stripe')
        });
      } catch (error) {
        console.error('Error parsing stored credentials:', error);
      }
    }
  };

  // Fetch phone numbers
  const { data: numbers = [], isLoading: numbersLoading } = useQuery({
    queryKey: ['phone-numbers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PhoneNumber[];
    },
    enabled: !!user && !!session
  });

  // Buy number mutation
  const buyNumberMutation = useMutation({
    mutationFn: async (areaCode: string) => {
      const newNumber = `+1 (${areaCode}) 555-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
      
      const { data, error } = await supabase
        .from('phone_numbers')
        .insert({
          number: newNumber,
          area_code: areaCode,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
      setNewAreaCode('');
      toast({
        title: "Success",
        description: `New number purchased: ${data.number}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to purchase number",
        variant: "destructive"
      });
    }
  });

  // Quarantine number mutation
  const quarantineMutation = useMutation({
    mutationFn: async (id: string) => {
      const quarantineDate = new Date();
      quarantineDate.setDate(quarantineDate.getDate() + 30);
      
      const { error } = await supabase
        .from('phone_numbers')
        .update({
          status: 'quarantined',
          quarantine_until: quarantineDate.toISOString().split('T')[0],
          is_spam: true
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
      toast({
        title: "Number Quarantined",
        description: "Number has been quarantined for 30 days",
      });
    }
  });

  // Release number mutation
  const releaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('phone_numbers')
        .update({
          status: 'active',
          quarantine_until: null,
          is_spam: false
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-numbers'] });
      toast({
        title: "Number Released",
        description: "Number has been released and is now active",
      });
    }
  });

  // Import to Retell AI
  const importToRetellMutation = useMutation({
    mutationFn: async ({ phoneNumber, terminationUri }: { phoneNumber: string; terminationUri: string }) => {
      return await importPhoneNumber(phoneNumber, terminationUri);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Phone number imported to Retell AI",
      });
    }
  });

  // Make call function (placeholder for Twilio integration)
  const makeCall = async (phoneNumber: string, targetNumber: string) => {
    if (!integrationStatus.twilio) {
      toast({
        title: "Twilio Not Configured",
        description: "Please configure your Twilio credentials in API Keys to make calls",
        variant: "destructive"
      });
      return;
    }

    // In a real app, this would use the stored Twilio credentials
    // to make an actual call via Supabase Edge Function
    toast({
      title: "Call Initiated",
      description: `Calling ${targetNumber} from ${phoneNumber}`,
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed Out",
      description: "You have been signed out successfully",
    });
  };

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: 'admin@example.com',
      password: 'password123'
    });

    if (error) {
      toast({
        title: "Sign In Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const buyNumber = () => {
    if (!newAreaCode) {
      toast({
        title: "Error",
        description: "Please enter an area code",
        variant: "destructive"
      });
      return;
    }
    buyNumberMutation.mutate(newAreaCode);
  };

  const exportToCSV = () => {
    const csvContent = [
      ['ID', 'Number', 'Area Code', 'Daily Calls', 'Status', 'Is Spam', 'Last Used'],
      ...numbers.map(n => [
        n.id,
        n.number,
        n.area_code,
        n.daily_calls,
        n.status,
        n.is_spam ? 'Yes' : 'No',
        n.last_used || 'Never'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dialer-numbers.csv';
    a.click();
    
    toast({
      title: "Export Complete",
      description: "CSV file has been downloaded",
    });
  };

  const handleImportToRetell = (phoneNumber: string) => {
    if (!retellUri) {
      toast({
        title: "Error",
        description: "Please enter a termination URI for Retell AI",
        variant: "destructive"
      });
      return;
    }
    
    importToRetellMutation.mutate({ phoneNumber, terminationUri: retellUri });
  };

  const getStatusBadge = (status: string, isSpam: boolean) => {
    if (status === 'quarantined') {
      return <Badge variant="destructive">Quarantined</Badge>;
    }
    if (isSpam) {
      return <Badge variant="outline" className="border-orange-500 text-orange-600">Spam Flag</Badge>;
    }
    return <Badge variant="default" className="bg-green-500">Active</Badge>;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user || !session) {
    return null;
  }

  const filteredNumbers = numbers.filter(n => {
    if (filterStatus === 'all') return true;
    return n.status === filterStatus;
  });

  const totalNumbers = numbers.length;
  const activeNumbers = numbers.filter(n => n.status === 'active').length;
  const quarantinedNumbers = numbers.filter(n => n.status === 'quarantined').length;
  const totalCallsToday = numbers.reduce((sum, n) => sum + n.daily_calls, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navigation />
      <AutomationEngine numbers={numbers} onRefreshNumbers={onRefreshNumbers} />
      <AlertSystem numbers={numbers} />
      
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Phone Number Management Dashboard</h1>
          <p className="text-lg text-gray-600">Manage your voice agent phone numbers with intelligent automation</p>
        </div>

        {/* Integration Status Alert */}
        {(!integrationStatus.twilio && !integrationStatus.retell) && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-orange-800">Integration Required</h3>
                  <p className="text-orange-700">Configure your Twilio or Retell AI credentials to start making calls</p>
                </div>
                <Button 
                  onClick={() => navigate('/api-keys')}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  Configure API Keys
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Call Analytics</TabsTrigger>
            <TabsTrigger value="ai-engine">AI Engine</TabsTrigger>
            <TabsTrigger value="yellowstone">Yellowstone</TabsTrigger>
            <TabsTrigger value="rotation">Number Rotation</TabsTrigger>
            <TabsTrigger value="spam-detection">Spam Protection</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Numbers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{numbers.length}</div>
                  <p className="text-xs text-gray-500">
                    {numbers.filter(n => n.status === 'active').length} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Daily Calls</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {numbers.reduce((sum, n) => sum + (n.daily_calls || 0), 0)}
                  </div>
                  <p className="text-xs text-gray-500">
                    Avg: {Math.round(numbers.reduce((sum, n) => sum + (n.daily_calls || 0), 0) / numbers.length || 0)} per number
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Quarantined</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {numbers.filter(n => n.status === 'quarantined').length}
                  </div>
                  <p className="text-xs text-gray-500">
                    {Math.round((numbers.filter(n => n.status === 'quarantined').length / numbers.length) * 100 || 0)}% of total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Area Codes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Set(numbers.map(n => n.area_code)).size}
                  </div>
                  <p className="text-xs text-gray-500">
                    Geographic diversity
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Controls */}
            <Card>
              <CardHeader>
                <CardTitle>Number Management</CardTitle>
                <CardDescription>Purchase new numbers and manage existing ones</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="flex gap-2 flex-1">
                    <Input
                      placeholder="Area code (e.g., 720)"
                      value={newAreaCode}
                      onChange={(e) => setNewAreaCode(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button 
                      onClick={buyNumber} 
                      disabled={buyNumberMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {buyNumberMutation.isPending ? 'Buying...' : 'Buy Number'}
                    </Button>
                  </div>
                  
                  <div className="flex gap-2">
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Filter status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="quarantined">Quarantined</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Button variant="outline" onClick={exportToCSV}>
                      Export CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Numbers Table */}
            <Card>
              <CardHeader>
                <CardTitle>Phone Numbers</CardTitle>
                <CardDescription>Manage your phone numbers and their status</CardDescription>
              </CardHeader>
              <CardContent>
                {numbersLoading ? (
                  <div className="text-center py-8">Loading numbers...</div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Number</TableHead>
                          <TableHead>Area Code</TableHead>
                          <TableHead>Daily Calls</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Used</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredNumbers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                              No phone numbers found. Purchase your first number to get started.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredNumbers.map((number) => (
                            <TableRow key={number.id}>
                              <TableCell className="font-mono">{number.number}</TableCell>
                              <TableCell>{number.area_code}</TableCell>
                              <TableCell>
                                <span className={`font-semibold ${number.daily_calls > 45 ? 'text-red-600' : 'text-green-600'}`}>
                                  {number.daily_calls}/50
                                </span>
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(number.status, number.is_spam)}
                              </TableCell>
                              <TableCell className="text-gray-600">
                                {number.last_used ? new Date(number.last_used).toLocaleString() : 'Never'}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2 flex-wrap">
                                  {number.status === 'active' ? (
                                    <>
                                      <Button
                                        variant="default"
                                        size="sm"
                                        onClick={() => makeCall(number.number, '+1234567890')}
                                        disabled={!integrationStatus.twilio}
                                        className="bg-blue-600 hover:bg-blue-700"
                                      >
                                        Test Call
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => quarantineMutation.mutate(number.id)}
                                        disabled={quarantineMutation.isPending}
                                      >
                                        Quarantine
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => releaseMutation.mutate(number.id)}
                                      disabled={releaseMutation.isPending}
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      Release
                                    </Button>
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
          </TabsContent>

          <TabsContent value="analytics">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">System Analytics</h2>
                <Button onClick={onRefreshNumbers} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Data
                </Button>
              </div>
              <CallAnalytics numbers={numbers} />
            </div>
          </TabsContent>

          <TabsContent value="ai-engine">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">AI Decision Engine</h2>
                <Button onClick={onRefreshNumbers} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Analysis
                </Button>
              </div>
              <AIDecisionEngine numbers={numbers} onRefreshNumbers={onRefreshNumbers} />
            </div>
          </TabsContent>

          <TabsContent value="yellowstone">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Yellowstone Rollback System</h2>
                <Button onClick={onRefreshNumbers} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Data
                </Button>
              </div>
              <YellowstoneManager numbers={numbers} onRefreshNumbers={onRefreshNumbers} />
            </div>
          </TabsContent>

          <TabsContent value="rotation">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Advanced Number Rotation</h2>
                <Button onClick={onRefreshNumbers} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Data
                </Button>
              </div>
              <NumberRotationManager numbers={numbers} onRefreshNumbers={onRefreshNumbers} />
            </div>
          </TabsContent>

          <TabsContent value="spam-detection">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Spam Detection & Protection</h2>
                <Button onClick={onRefreshNumbers} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Data
                </Button>
              </div>
              <SpamDetectionManager numbers={numbers} onRefreshNumbers={onRefreshNumbers} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
