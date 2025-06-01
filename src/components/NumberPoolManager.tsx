
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Database, Plus, Minus, RotateCw, Eye } from 'lucide-react';

interface NumberPoolManagerProps {
  numbers: any[];
  onRefreshNumbers: () => void;
}

const NumberPoolManager = ({ numbers, onRefreshNumbers }: NumberPoolManagerProps) => {
  const [retellNumbers, setRetellNumbers] = useState<any[]>([]);
  const [showPoolDetails, setShowPoolDetails] = useState(false);
  const { toast } = useToast();

  // Categorize numbers
  const availablePool = numbers.filter(n => n.status === 'active' && !retellNumbers.some(r => r.phone_number === n.number));
  const activeInRetell = numbers.filter(n => retellNumbers.some(r => r.phone_number === n.number));
  const quarantinedPool = numbers.filter(n => n.status === 'quarantined');
  const cooldownPool = numbers.filter(n => n.status === 'cooldown');

  const loadRetellNumbers = async () => {
    // This would call your Retell AI API to get current numbers
    // For now, simulate some data
    const mockRetellNumbers = numbers.slice(0, 3).map(n => ({
      phone_number: n.number,
      nickname: `Agent Number ${n.number.slice(-4)}`,
      inbound_agent_id: 'agent_123',
      termination_uri: 'someuri.pstn.twilio.com'
    }));
    setRetellNumbers(mockRetellNumbers);
  };

  React.useEffect(() => {
    loadRetellNumbers();
  }, [numbers]);

  const executeRotation = async (strategy: string, count: number) => {
    if (availablePool.length < count) {
      toast({
        title: "Insufficient Numbers",
        description: `Need ${count} numbers but only ${availablePool.length} available in pool`,
        variant: "destructive"
      });
      return;
    }

    // Select numbers to remove from Retell (oldest/highest call volume)
    let numbersToRemove = [];
    if (strategy === 'call-volume') {
      numbersToRemove = activeInRetell
        .sort((a, b) => b.daily_calls - a.daily_calls)
        .slice(0, count);
    } else if (strategy === 'age') {
      numbersToRemove = activeInRetell
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(0, count);
    } else {
      // Random selection
      numbersToRemove = activeInRetell
        .sort(() => Math.random() - 0.5)
        .slice(0, count);
    }

    // Select numbers to add (fresh from pool)
    const numbersToAdd = availablePool.slice(0, count);

    toast({
      title: "Rotation Executed",
      description: `Removed ${numbersToRemove.length} numbers, added ${numbersToAdd.length} fresh numbers`,
    });

    // Here you would make actual API calls to Retell AI
    console.log('Rotation executed:', {
      removed: numbersToRemove.map(n => n.number),
      added: numbersToAdd.map(n => n.number),
      strategy
    });

    // Refresh the data
    onRefreshNumbers();
    loadRetellNumbers();
  };

  return (
    <div className="space-y-6">
      {/* Pool Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Available Pool</p>
                <p className="text-2xl font-bold text-green-600">{availablePool.length}</p>
              </div>
              <Database className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active in Retell</p>
                <p className="text-2xl font-bold text-blue-600">{activeInRetell.length}</p>
              </div>
              <RotateCw className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Quarantined</p>
                <p className="text-2xl font-bold text-red-600">{quarantinedPool.length}</p>
              </div>
              <Minus className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Cooldown</p>
                <p className="text-2xl font-bold text-orange-600">{cooldownPool.length}</p>
              </div>
              <Plus className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Rotation Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Rotation Actions</CardTitle>
          <CardDescription>Execute immediate rotations with different strategies</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={() => executeRotation('call-volume', 2)}
              disabled={availablePool.length < 2}
              className="h-auto p-4"
            >
              <div className="text-center">
                <RotateCw className="h-6 w-6 mx-auto mb-2" />
                <div className="font-medium">Rotate High Volume</div>
                <div className="text-xs opacity-75">Replace 2 busiest numbers</div>
              </div>
            </Button>

            <Button
              onClick={() => executeRotation('age', 3)}
              disabled={availablePool.length < 3}
              className="h-auto p-4"
              variant="outline"
            >
              <div className="text-center">
                <RotateCw className="h-6 w-6 mx-auto mb-2" />
                <div className="font-medium">Rotate Oldest</div>
                <div className="text-xs opacity-75">Replace 3 oldest numbers</div>
              </div>
            </Button>

            <Button
              onClick={() => executeRotation('random', 1)}
              disabled={availablePool.length < 1}
              className="h-auto p-4"
              variant="secondary"
            >
              <div className="text-center">
                <RotateCw className="h-6 w-6 mx-auto mb-2" />
                <div className="font-medium">Random Rotation</div>
                <div className="text-xs opacity-75">Replace 1 random number</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pool Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Number Pool Details</CardTitle>
              <CardDescription>Detailed view of number allocation</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowPoolDetails(!showPoolDetails)}
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPoolDetails ? 'Hide' : 'Show'} Details
            </Button>
          </div>
        </CardHeader>
        {showPoolDetails && (
          <CardContent>
            <div className="space-y-6">
              {/* Active in Retell */}
              <div>
                <h4 className="font-medium mb-3">Active in Retell AI ({activeInRetell.length})</h4>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Daily Calls</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeInRetell.map((number) => (
                        <TableRow key={number.id}>
                          <TableCell className="font-mono">{number.number}</TableCell>
                          <TableCell>
                            <Badge variant={number.daily_calls > 40 ? "destructive" : "default"}>
                              {number.daily_calls}/50
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">Default Agent</TableCell>
                          <TableCell>
                            <Badge variant="default">Active</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Available Pool */}
              <div>
                <h4 className="font-medium mb-3">Available Pool ({availablePool.length})</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {availablePool.slice(0, 8).map((number) => (
                    <div key={number.id} className="p-2 border rounded text-sm">
                      <div className="font-mono">{number.number}</div>
                      <div className="text-xs text-gray-500">{number.daily_calls} calls</div>
                    </div>
                  ))}
                  {availablePool.length > 8 && (
                    <div className="p-2 border rounded text-sm text-center text-gray-500">
                      +{availablePool.length - 8} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default NumberPoolManager;
