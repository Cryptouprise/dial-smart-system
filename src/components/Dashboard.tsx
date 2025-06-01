import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsLoading(false);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

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
    enabled: !!user
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed Out",
      description: "You have been signed out successfully",
    });
    window.location.href = '/auth';
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

  if (!user) {
    window.location.href = '/auth';
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">📞 Smart Dialer System</h1>
            <p className="text-lg text-gray-600">Manage your phone numbers, call limits, and spam protection</p>
          </div>
          <Button onClick={handleSignOut} variant="outline">
            Sign Out
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Numbers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{totalNumbers}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Numbers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeNumbers}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Quarantined</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{quarantinedNumbers}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Calls Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{totalCallsToday}</div>
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
                            <div className="flex gap-2">
                              {number.status === 'active' ? (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => quarantineMutation.mutate(number.id)}
                                  disabled={quarantineMutation.isPending}
                                >
                                  Quarantine
                                </Button>
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
      </div>
    </div>
  );
};

export default Dashboard;
