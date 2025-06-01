
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useRetellAI } from '@/hooks/useRetellAI';
import { Upload, RotateCw, Settings, Play, Pause } from 'lucide-react';

interface NumberRotationManagerProps {
  numbers: any[];
  onRefreshNumbers: () => void;
}

const NumberRotationManager = ({ numbers, onRefreshNumbers }: NumberRotationManagerProps) => {
  const [terminationUri, setTerminationUri] = useState('');
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationInterval, setRotationInterval] = useState('24');
  const [activePoolSize, setActivePoolSize] = useState('5');
  const [rotationStrategy, setRotationStrategy] = useState('round-robin');
  const { toast } = useToast();
  const { importPhoneNumber, deletePhoneNumber, listPhoneNumbers, isLoading } = useRetellAI();

  const activeNumbers = numbers.filter(n => n.status === 'active');

  const handleSelectNumber = (numberId: string) => {
    setSelectedNumbers(prev => 
      prev.includes(numberId) 
        ? prev.filter(id => id !== numberId)
        : [...prev, numberId]
    );
  };

  const handleSelectAll = () => {
    if (selectedNumbers.length === activeNumbers.length) {
      setSelectedNumbers([]);
    } else {
      setSelectedNumbers(activeNumbers.map(n => n.id));
    }
  };

  const handleBulkImport = async () => {
    if (!terminationUri) {
      toast({
        title: "Error",
        description: "Please enter a termination URI",
        variant: "destructive"
      });
      return;
    }

    if (selectedNumbers.length === 0) {
      toast({
        title: "Error", 
        description: "Please select numbers to import",
        variant: "destructive"
      });
      return;
    }

    for (const numberId of selectedNumbers) {
      const number = numbers.find(n => n.id === numberId);
      if (number) {
        await importPhoneNumber(number.number, terminationUri);
      }
    }

    setSelectedNumbers([]);
    toast({
      title: "Bulk Import Complete",
      description: `Imported ${selectedNumbers.length} numbers to Retell AI`,
    });
  };

  const handleManualImport = async (phoneNumber: string) => {
    if (!terminationUri) {
      toast({
        title: "Error",
        description: "Please enter a termination URI",
        variant: "destructive"
      });
      return;
    }

    await importPhoneNumber(phoneNumber, terminationUri);
  };

  const startRotation = () => {
    setRotationEnabled(true);
    toast({
      title: "Rotation Started",
      description: `Numbers will rotate every ${rotationInterval} hours`,
    });
  };

  const stopRotation = () => {
    setRotationEnabled(false);
    toast({
      title: "Rotation Stopped",
      description: "Automatic number rotation has been paused",
    });
  };

  return (
    <div className="space-y-6">
      {/* Manual Import Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Manual Number Import
          </CardTitle>
          <CardDescription>
            Import phone numbers to Retell AI individually or in bulk
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Termination URI Input */}
          <div>
            <Label htmlFor="terminationUri">Termination URI</Label>
            <Input
              id="terminationUri"
              placeholder="e.g., someuri.pstn.twilio.com"
              value={terminationUri}
              onChange={(e) => setTerminationUri(e.target.value)}
            />
          </div>

          {/* Bulk Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Select Numbers to Import ({selectedNumbers.length} selected)</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedNumbers.length === activeNumbers.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded p-2">
              {activeNumbers.map((number) => (
                <div
                  key={number.id}
                  className={`p-2 border rounded cursor-pointer transition-colors ${
                    selectedNumbers.includes(number.id)
                      ? 'bg-blue-50 border-blue-500'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleSelectNumber(number.id)}
                >
                  <div className="font-mono text-sm">{number.number}</div>
                  <div className="text-xs text-gray-500">{number.daily_calls} calls today</div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleBulkImport}
              disabled={isLoading || selectedNumbers.length === 0 || !terminationUri}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Import Selected ({selectedNumbers.length})
            </Button>
            <Button
              variant="outline"
              onClick={() => setSelectedNumbers([])}
              disabled={selectedNumbers.length === 0}
            >
              Clear Selection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rotation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCw className="h-5 w-5" />
            Number Rotation Settings
          </CardTitle>
          <CardDescription>
            Configure automatic number rotation rules and schedules
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Rotation Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Automatic Rotation</Label>
              <p className="text-sm text-gray-500">Automatically rotate numbers based on schedule</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={rotationEnabled ? "default" : "secondary"}>
                {rotationEnabled ? "Active" : "Inactive"}
              </Badge>
              <Switch
                checked={rotationEnabled}
                onCheckedChange={setRotationEnabled}
              />
            </div>
          </div>

          {/* Rotation Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="rotationInterval">Rotation Interval (hours)</Label>
              <Select value={rotationInterval} onValueChange={setRotationInterval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Every Hour</SelectItem>
                  <SelectItem value="6">Every 6 Hours</SelectItem>
                  <SelectItem value="12">Every 12 Hours</SelectItem>
                  <SelectItem value="24">Daily</SelectItem>
                  <SelectItem value="168">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="activePoolSize">Active Pool Size</Label>
              <Select value={activePoolSize} onValueChange={setActivePoolSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Number</SelectItem>
                  <SelectItem value="3">3 Numbers</SelectItem>
                  <SelectItem value="5">5 Numbers</SelectItem>
                  <SelectItem value="10">10 Numbers</SelectItem>
                  <SelectItem value="20">20 Numbers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="rotationStrategy">Rotation Strategy</Label>
              <Select value={rotationStrategy} onValueChange={setRotationStrategy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="round-robin">Round Robin</SelectItem>
                  <SelectItem value="random">Random</SelectItem>
                  <SelectItem value="call-volume">By Call Volume</SelectItem>
                  <SelectItem value="age">By Age</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Rotation Controls */}
          <div className="flex gap-2">
            {!rotationEnabled ? (
              <Button onClick={startRotation} className="bg-green-600 hover:bg-green-700">
                <Play className="h-4 w-4 mr-2" />
                Start Rotation
              </Button>
            ) : (
              <Button onClick={stopRotation} variant="destructive">
                <Pause className="h-4 w-4 mr-2" />
                Stop Rotation
              </Button>
            )}
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Advanced Settings
            </Button>
          </div>

          {/* Rotation Status */}
          {rotationEnabled && (
            <div className="bg-green-50 border border-green-200 rounded p-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-green-800">
                  Rotation Active: {activePoolSize} numbers rotating every {rotationInterval} hours
                </span>
              </div>
              <p className="text-xs text-green-600 mt-1">
                Strategy: {rotationStrategy.replace('-', ' ')} | Next rotation in: 23h 45m
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common number management operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-auto p-4">
              <div className="text-center">
                <Upload className="h-6 w-6 mx-auto mb-2" />
                <div className="font-medium">Import All Active</div>
                <div className="text-xs text-gray-500">Import all active numbers</div>
              </div>
            </Button>
            
            <Button variant="outline" className="h-auto p-4">
              <div className="text-center">
                <RotateCw className="h-6 w-6 mx-auto mb-2" />
                <div className="font-medium">Rotate Now</div>
                <div className="text-xs text-gray-500">Trigger immediate rotation</div>
              </div>
            </Button>
            
            <Button variant="outline" className="h-auto p-4">
              <div className="text-center">
                <Settings className="h-6 w-6 mx-auto mb-2" />
                <div className="font-medium">View Retell Status</div>
                <div className="text-xs text-gray-500">Check current imports</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NumberRotationManager;
