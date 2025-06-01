
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Calendar } from 'lucide-react';

interface RotationEvent {
  id: string;
  timestamp: string;
  type: 'automatic' | 'manual' | 'spam_triggered';
  numbersAdded: string[];
  numbersRemoved: string[];
  reason: string;
  agentId?: string;
}

const RotationHistory = () => {
  const [rotationEvents, setRotationEvents] = useState<RotationEvent[]>([]);

  useEffect(() => {
    // Load rotation history from localStorage or API
    const savedHistory = localStorage.getItem('rotation-history');
    if (savedHistory) {
      setRotationEvents(JSON.parse(savedHistory));
    } else {
      // Generate sample data
      const sampleEvents: RotationEvent[] = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          type: 'automatic',
          numbersAdded: ['+1 (720) 555-0123', '+1 (720) 555-0124'],
          numbersRemoved: ['+1 (720) 555-0001', '+1 (720) 555-0002'],
          reason: 'Scheduled rotation (24h interval)',
          agentId: 'agent_123'
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          type: 'spam_triggered',
          numbersAdded: ['+1 (720) 555-0125'],
          numbersRemoved: ['+1 (720) 555-0003'],
          reason: 'Number quarantined due to spam (50+ calls)',
          agentId: 'agent_123'
        },
        {
          id: '3',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          type: 'manual',
          numbersAdded: ['+1 (720) 555-0126', '+1 (720) 555-0127'],
          numbersRemoved: [],
          reason: 'Manual bulk import',
          agentId: 'agent_123'
        }
      ];
      setRotationEvents(sampleEvents);
    }
  }, []);

  const addRotationEvent = (event: Omit<RotationEvent, 'id' | 'timestamp'>) => {
    const newEvent: RotationEvent = {
      ...event,
      id: Date.now().toString(),
      timestamp: new Date().toISOString()
    };
    
    const updatedEvents = [newEvent, ...rotationEvents].slice(0, 50); // Keep last 50 events
    setRotationEvents(updatedEvents);
    localStorage.setItem('rotation-history', JSON.stringify(updatedEvents));
  };

  const exportHistory = () => {
    const csvContent = [
      ['Timestamp', 'Type', 'Numbers Added', 'Numbers Removed', 'Reason'],
      ...rotationEvents.map(event => [
        new Date(event.timestamp).toLocaleString(),
        event.type,
        event.numbersAdded.join('; '),
        event.numbersRemoved.join('; '),
        event.reason
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rotation-history.csv';
    a.click();
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'automatic':
        return <Badge variant="default">Automatic</Badge>;
      case 'manual':
        return <Badge variant="secondary">Manual</Badge>;
      case 'spam_triggered':
        return <Badge variant="destructive">Spam Triggered</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Rotation History
            </CardTitle>
            <CardDescription>Track all number rotations and changes</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportHistory}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rotationEvents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No rotation events recorded yet
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rotationEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-mono text-sm">
                      {new Date(event.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {getTypeBadge(event.type)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {event.numbersAdded.length > 0 && (
                          <div className="text-sm">
                            <span className="text-green-600 font-medium">+{event.numbersAdded.length}</span>
                            <span className="text-gray-500 ml-1">added</span>
                          </div>
                        )}
                        {event.numbersRemoved.length > 0 && (
                          <div className="text-sm">
                            <span className="text-red-600 font-medium">-{event.numbersRemoved.length}</span>
                            <span className="text-gray-500 ml-1">removed</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {event.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RotationHistory;
