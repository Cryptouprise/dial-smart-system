import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Plus, Phone, AlertTriangle, TrendingUp, Users, Clock, Shield, RotateCw, Database, Zap, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Navigation from '@/components/Navigation';
import CallAnalytics from '@/components/CallAnalytics';
import NumberRotationManager from '@/components/NumberRotationManager';
import SpamDetectionManager from '@/components/SpamDetectionManager';
import YellowstoneManager from '@/components/YellowstoneManager';
import AIDecisionEngine from '@/components/AIDecisionEngine';
import SystemHealthDashboard from '@/components/SystemHealthDashboard';

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  status: 'active' | 'quarantined' | 'inactive';
  dailyCalls: number;
  spamScore: number;
  dateAdded: string;
}

interface SystemHealth {
  apiStatus: 'online' | 'offline';
  databaseStatus: 'online' | 'offline';
  lastBackup: string;
}

const Dashboard = () => {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [areaCode, setAreaCode] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [autoImport, setAutoImport] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Mock data for phone numbers
    const mockNumbers: PhoneNumber[] = [
      {
        id: '1',
        phoneNumber: '+15551234567',
        status: 'active',
        dailyCalls: 25,
        spamScore: 30,
        dateAdded: '2024-01-20',
      },
      {
        id: '2',
        phoneNumber: '+15559876543',
        status: 'quarantined',
        dailyCalls: 5,
        spamScore: 85,
        dateAdded: '2024-01-15',
      },
      {
        id: '3',
        phoneNumber: '+12125551212',
        status: 'active',
        dailyCalls: 40,
        spamScore: 60,
        dateAdded: '2024-01-10',
      },
      {
        id: '4',
        phoneNumber: '+13105550000',
        status: 'inactive',
        dailyCalls: 0,
        spamScore: 10,
        dateAdded: '2023-12-01',
      },
    ];
    setNumbers(mockNumbers);
  }, []);

  const handleBuyNumbers = async () => {
    setIsLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsLoading(false);
    toast({
      title: 'Numbers Purchased!',
      description: `Successfully purchased ${quantity} numbers with area code ${areaCode}.`,
    });
  };

  const handleTestCall = (phoneNumber: string) => {
    toast({
      title: 'Test Call Initiated',
      description: `Calling ${phoneNumber}...`,
    });
  };

  const handleReleaseFromQuarantine = (phoneNumber: string) => {
    setNumbers(numbers.map(n => n.phoneNumber === phoneNumber ? { ...n, status: 'active' } : n));
    toast({
      title: 'Number Released',
      description: `${phoneNumber} has been released from quarantine.`,
    });
  };

  const refreshNumbers = () => {
    toast({
      title: 'Numbers Refreshed',
      description: 'Phone numbers have been refreshed.',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <Navigation />
      <div className="container mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 space-y-3 sm:space-y-4 lg:space-y-6 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col space-y-1 sm:space-y-2">
          <h1 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-slate-900 dark:text-slate-100">
            📞 Smart Dialer Dashboard
          </h1>
          <p className="text-xs sm:text-sm lg:text-base text-slate-600 dark:text-slate-400">
            Manage your phone numbers and calling campaigns
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="w-full overflow-x-auto pb-2">
            <TabsList className="inline-flex h-auto bg-slate-100 dark:bg-slate-800 min-w-max w-full sm:w-auto">
              <TabsTrigger value="overview" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                Overview
              </TabsTrigger>
              <TabsTrigger value="analytics" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                Analytics
              </TabsTrigger>
              <TabsTrigger value="ai-engine" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                AI Engine
              </TabsTrigger>
              <TabsTrigger value="yellowstone" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                Yellowstone
              </TabsTrigger>
              <TabsTrigger value="rotation" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                Rotation
              </TabsTrigger>
              <TabsTrigger value="spam" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 whitespace-nowrap">
                Spam
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
              <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-1 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                    Total Numbers
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-2 sm:px-4 pb-2 sm:pb-4">
                  <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {numbers.length}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {numbers.filter(n => n.status === 'active').length} active
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-1 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                    Daily Calls
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-2 sm:px-4 pb-2 sm:pb-4">
                  <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {numbers.reduce((sum, n) => sum + n.dailyCalls, 0)}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Avg: {Math.round(numbers.reduce((sum, n) => sum + n.dailyCalls, 0) / Math.max(numbers.length, 1))}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-1 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                    Quarantined
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-2 sm:px-4 pb-2 sm:pb-4">
                  <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {numbers.filter(n => n.status === 'quarantined').length}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {Math.round((numbers.filter(n => n.status === 'quarantined').length / Math.max(numbers.length, 1)) * 100)}% of total
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-1 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                    Area Codes
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-2 sm:px-4 pb-2 sm:pb-4">
                  <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {new Set(numbers.map(n => n.phoneNumber.slice(2, 5))).size}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Geographic spread
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Buy Numbers Section */}
            <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-slate-200 dark:border-slate-700">
              <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100 text-sm sm:text-base lg:text-lg">
                  <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                  Buy Numbers
                </CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
                  Purchase new phone numbers for your campaigns
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                  <div className="space-y-1 sm:space-y-2">
                    <label className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                      Area Code
                    </label>
                    <Input
                      placeholder="e.g., 555"
                      value={areaCode}
                      onChange={(e) => setAreaCode(e.target.value)}
                      className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-xs sm:text-sm h-8 sm:h-10"
                    />
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    <label className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                      Quantity
                    </label>
                    <Input
                      type="number"
                      placeholder="10"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-xs sm:text-sm h-8 sm:h-10"
                    />
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    <label className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                      Auto-import to Retell AI
                    </label>
                    <div className="flex items-center space-x-2 h-8 sm:h-10">
                      <input
                        type="checkbox"
                        id="auto-import"
                        checked={autoImport}
                        onChange={(e) => setAutoImport(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-600"
                      />
                      <label htmlFor="auto-import" className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                        Enable
                      </label>
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button 
                      onClick={handleBuyNumbers}
                      disabled={isLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm h-8 sm:h-10"
                    >
                      {isLoading ? 'Purchasing...' : 'Purchase Numbers'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Numbers Table */}
            <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-slate-200 dark:border-slate-700">
              <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                  <CardTitle className="text-slate-900 dark:text-slate-100 text-sm sm:text-base lg:text-lg">
                    Phone Numbers ({numbers.length})
                  </CardTitle>
                  <Button 
                    onClick={refreshNumbers}
                    variant="outline"
                    size="sm"
                    className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs sm:text-sm h-7 sm:h-8"
                  >
                    <RotateCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid grid-cols-6 gap-2 sm:gap-3 lg:gap-4 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 pb-2 sm:pb-3 border-b border-slate-200 dark:border-slate-700">
                      <div>Phone Number</div>
                      <div>Status</div>
                      <div>Daily Calls</div>
                      <div>Spam Score</div>
                      <div>Added</div>
                      <div>Actions</div>
                    </div>
                    <div className="space-y-1 sm:space-y-2 mt-2 sm:mt-3">
                      {numbers.map((number) => (
                        <div key={number.id} className="grid grid-cols-6 gap-2 sm:gap-3 lg:gap-4 items-center py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <div className="font-mono text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                            {number.phoneNumber}
                          </div>
                          <div>
                            <Badge 
                              variant={number.status === 'active' ? 'default' : 
                                     number.status === 'quarantined' ? 'destructive' : 'secondary'}
                              className="text-xs px-1 py-0.5"
                            >
                              {number.status}
                            </Badge>
                          </div>
                          <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                            {number.dailyCalls}
                          </div>
                          <div>
                            <Badge 
                              variant={number.spamScore > 70 ? 'destructive' : 
                                     number.spamScore > 40 ? 'secondary' : 'default'}
                              className="text-xs px-1 py-0.5"
                            >
                              {number.spamScore}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {number.dateAdded}
                          </div>
                          <div className="flex flex-col sm:flex-row gap-1">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleTestCall(number.phoneNumber)}
                              className="text-xs border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 h-6 sm:h-7 px-1 sm:px-2"
                            >
                              Test
                            </Button>
                            {number.status === 'quarantined' && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleReleaseFromQuarantine(number.phoneNumber)}
                                className="text-xs border-green-300 dark:border-green-600 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 h-6 sm:h-7 px-1 sm:px-2"
                              >
                                Release
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {numbers.length === 0 && (
                  <div className="text-center py-6 sm:py-8 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
                    No phone numbers found. Purchase some numbers to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <CallAnalytics numbers={numbers} />
          </TabsContent>

          <TabsContent value="ai-engine">
            <AIDecisionEngine numbers={numbers} onRefreshNumbers={refreshNumbers} />
          </TabsContent>

          <TabsContent value="yellowstone">
            <YellowstoneManager numbers={numbers} onRefreshNumbers={refreshNumbers} />
          </TabsContent>

          <TabsContent value="rotation">
            <NumberRotationManager numbers={numbers} onRefreshNumbers={refreshNumbers} />
          </TabsContent>

          <TabsContent value="spam">
            <SpamDetectionManager />
          </TabsContent>
        </Tabs>

        {/* System Health */}
        <SystemHealthDashboard />
      </div>
    </div>
  );
};

export default Dashboard;
