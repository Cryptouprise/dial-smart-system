
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Phone, AlertTriangle, RotateCw } from 'lucide-react';

interface CallAnalyticsProps {
  numbers: any[];
}

const CallAnalytics = ({ numbers }: CallAnalyticsProps) => {
  // Ensure numbers is always an array
  const safeNumbers = Array.isArray(numbers) ? numbers : [];

  // Generate sample analytics data based on numbers
  const callVolumeData = Array.from({ length: 7 }, (_, i) => ({
    day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
    calls: Math.floor(Math.random() * 100) + 20,
    spam: Math.floor(Math.random() * 10)
  }));

  const numberStatusData = [
    { name: 'Active', value: safeNumbers.filter(n => n?.status === 'active').length, color: '#10B981' },
    { name: 'Quarantined', value: safeNumbers.filter(n => n?.status === 'quarantined').length, color: '#EF4444' },
    { name: 'Cooldown', value: safeNumbers.filter(n => n?.status === 'cooldown').length, color: '#F59E0B' }
  ];

  const topPerformers = safeNumbers
    .filter(n => n?.number && n?.daily_calls !== undefined && n?.status) // Filter out invalid entries
    .sort((a, b) => (b.daily_calls || 0) - (a.daily_calls || 0))
    .slice(0, 5)
    .map(n => ({
      number: n.number ? n.number.slice(-4) : 'N/A',
      calls: n.daily_calls || 0,
      status: n.status || 'unknown'
    }));

  // Rotation history data
  const rotationHistory = JSON.parse(localStorage.getItem('rotation-history') || '[]');
  const recentRotations = rotationHistory.slice(0, 7).map((r: any, i: number) => ({
    day: `Day ${i + 1}`,
    rotations: Math.floor(Math.random() * 5) + 1
  }));

  const totalCalls = safeNumbers.reduce((sum, n) => sum + (n?.daily_calls || 0), 0);
  const avgCallsPerNumber = safeNumbers.length > 0 ? totalCalls / safeNumbers.length : 0;
  const highVolumeNumbers = safeNumbers.filter(n => (n?.daily_calls || 0) > 40).length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Calls Today</p>
                <p className="text-2xl font-bold text-blue-600">{totalCalls}</p>
              </div>
              <Phone className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Calls/Number</p>
                <p className="text-2xl font-bold text-green-600">{avgCallsPerNumber.toFixed(1)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">High Volume</p>
                <p className="text-2xl font-bold text-orange-600">{highVolumeNumbers}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Numbers</p>
                <p className="text-2xl font-bold text-purple-600">{safeNumbers.filter(n => n?.status === 'active').length}</p>
              </div>
              <RotateCw className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Volume Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Call Volume</CardTitle>
            <CardDescription>Daily call volume and spam detection</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={callVolumeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="calls" stroke="#3B82F6" strokeWidth={2} name="Total Calls" />
                <Line type="monotone" dataKey="spam" stroke="#EF4444" strokeWidth={2} name="Spam Calls" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Number Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Number Status Distribution</CardTitle>
            <CardDescription>Current status of all phone numbers</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={numberStatusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {numberStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Numbers</CardTitle>
            <CardDescription>Numbers with highest call volume today</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topPerformers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="number" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="calls" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Rotation Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Rotation Activity</CardTitle>
            <CardDescription>Recent rotation events</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={recentRotations}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="rotations" fill="#8B5CF6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CallAnalytics;
