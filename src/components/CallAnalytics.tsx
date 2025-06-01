
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Phone, AlertTriangle, RotateCw } from 'lucide-react';

interface CallAnalyticsProps {
  numbers: any[];
}

const CallAnalytics = ({ numbers }: CallAnalyticsProps) => {
  // Generate sample analytics data based on numbers
  const callVolumeData = Array.from({ length: 7 }, (_, i) => ({
    day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
    calls: Math.floor(Math.random() * 100) + 20,
    spam: Math.floor(Math.random() * 10)
  }));

  const numberStatusData = [
    { name: 'Active', value: numbers.filter(n => n.status === 'active').length, color: '#10B981' },
    { name: 'Quarantined', value: numbers.filter(n => n.status === 'quarantined').length, color: '#EF4444' },
    { name: 'Cooldown', value: numbers.filter(n => n.status === 'cooldown').length, color: '#F59E0B' }
  ];

  const topPerformers = numbers
    .sort((a, b) => b.daily_calls - a.daily_calls)
    .slice(0, 5)
    .map(n => ({
      number: n.number.slice(-4),
      calls: n.daily_calls,
      status: n.status
    }));

  const totalCalls = numbers.reduce((sum, n) => sum + n.daily_calls, 0);
  const avgCallsPerNumber = totalCalls / (numbers.length || 1);
  const highVolumeNumbers = numbers.filter(n => n.daily_calls > 40).length;

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
                <p className="text-2xl font-bold text-purple-600">{numbers.filter(n => n.status === 'active').length}</p>
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
    </div>
  );
};

export default CallAnalytics;
