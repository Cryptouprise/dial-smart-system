
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface NumberRecord {
  id: number;
  number: string;
  area_code: string;
  daily_calls: number;
  status: 'active' | 'quarantined' | 'cooldown';
  quarantine_until?: string;
  is_spam: boolean;
  last_used?: string;
}

const Dashboard = () => {
  const [numbers, setNumbers] = useState<NumberRecord[]>([
    {
      id: 1,
      number: '+1 (720) 555-0123',
      area_code: '720',
      daily_calls: 23,
      status: 'active',
      is_spam: false,
      last_used: '2024-06-01 14:30'
    },
    {
      id: 2,
      number: '+1 (303) 555-0456',
      area_code: '303',
      daily_calls: 47,
      status: 'active',
      is_spam: false,
      last_used: '2024-06-01 15:45'
    },
    {
      id: 3,
      number: '+1 (720) 555-0789',
      area_code: '720',
      daily_calls: 52,
      status: 'quarantined',
      quarantine_until: '2024-06-30',
      is_spam: true,
      last_used: '2024-05-30 12:15'
    }
  ]);
  
  const [newAreaCode, setNewAreaCode] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const { toast } = useToast();

  const totalNumbers = numbers.length;
  const activeNumbers = numbers.filter(n => n.status === 'active').length;
  const quarantinedNumbers = numbers.filter(n => n.status === 'quarantined').length;
  const totalCallsToday = numbers.reduce((sum, n) => sum + n.daily_calls, 0);

  const buyNumber = () => {
    if (!newAreaCode) {
      toast({
        title: "Error",
        description: "Please enter an area code",
        variant: "destructive"
      });
      return;
    }

    const newNumber: NumberRecord = {
      id: Math.max(...numbers.map(n => n.id)) + 1,
      number: `+1 (${newAreaCode}) 555-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      area_code: newAreaCode,
      daily_calls: 0,
      status: 'active',
      is_spam: false
    };

    setNumbers([...numbers, newNumber]);
    setNewAreaCode('');
    
    toast({
      title: "Success",
      description: `New number purchased: ${newNumber.number}`,
    });
  };

  const quarantineNumber = (id: number) => {
    setNumbers(numbers.map(n => 
      n.id === id 
        ? { ...n, status: 'quarantined' as const, quarantine_until: '2024-07-01' }
        : n
    ));
    
    toast({
      title: "Number Quarantined",
      description: "Number has been quarantined for 30 days",
    });
  };

  const releaseNumber = (id: number) => {
    setNumbers(numbers.map(n => 
      n.id === id 
        ? { ...n, status: 'active' as const, quarantine_until: undefined, is_spam: false }
        : n
    ));
    
    toast({
      title: "Number Released",
      description: "Number has been released and is now active",
    });
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

  const filteredNumbers = numbers.filter(n => {
    if (filterStatus === 'all') return true;
    return n.status === filterStatus;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">📞 Smart Dialer System</h1>
          <p className="text-lg text-gray-600">Manage your Twilio numbers, call limits, and spam protection</p>
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
                <Button onClick={buyNumber} className="bg-blue-600 hover:bg-blue-700">
                  Buy Number
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
            <CardDescription>Manage your Twilio phone numbers and their status</CardDescription>
          </CardHeader>
          <CardContent>
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
                  {filteredNumbers.map((number) => (
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
                        {number.last_used || 'Never'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {number.status === 'active' ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => quarantineNumber(number.id)}
                            >
                              Quarantine
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => releaseNumber(number.id)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              Release
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
