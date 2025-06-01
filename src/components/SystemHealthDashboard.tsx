
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApiValidation } from '@/hooks/useApiValidation';
import { useNumberSync } from '@/hooks/useNumberSync';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Sync } from 'lucide-react';

const SystemHealthDashboard = () => {
  const { validateAllCredentials, validationResults, isValidating } = useApiValidation();
  const { syncNumberStatus, getLastSyncInfo, isSyncing } = useNumberSync();
  const [syncInfo, setSyncInfo] = useState<any>(null);

  useEffect(() => {
    const info = getLastSyncInfo();
    setSyncInfo(info);
  }, [getLastSyncInfo]);

  const handleSync = async () => {
    await syncNumberStatus();
    const info = getLastSyncInfo();
    setSyncInfo(info);
  };

  const getStatusIcon = (isValid: boolean, error?: string) => {
    if (error) return <XCircle className="h-4 w-4 text-red-500" />;
    if (isValid) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  };

  const getStatusBadge = (isValid: boolean, error?: string) => {
    if (error) return <Badge variant="destructive">Invalid</Badge>;
    if (isValid) return <Badge className="bg-green-500">Valid</Badge>;
    return <Badge variant="secondary">Unknown</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* API Credentials Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>API Credentials Status</span>
            <Button 
              onClick={validateAllCredentials}
              disabled={isValidating}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isValidating ? 'animate-spin' : ''}`} />
              Validate All
            </Button>
          </CardTitle>
          <CardDescription>Check the status of your configured API credentials</CardDescription>
        </CardHeader>
        <CardContent>
          {validationResults.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Click "Validate All" to check your API credentials
            </div>
          ) : (
            <div className="space-y-3">
              {validationResults.map((result) => (
                <div key={result.service} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(result.isValid, result.error)}
                    <div>
                      <div className="font-medium capitalize">{result.service}</div>
                      {result.error && (
                        <div className="text-sm text-red-600">{result.error}</div>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(result.isValid, result.error)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Number Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Number Synchronization</span>
            <Button 
              onClick={handleSync}
              disabled={isSyncing}
              variant="outline"
              size="sm"
            >
              <Sync className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Now
            </Button>
          </CardTitle>
          <CardDescription>Keep local and Retell AI number status in sync</CardDescription>
        </CardHeader>
        <CardContent>
          {syncInfo?.lastSync ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {syncInfo.results?.localNumbers || 0}
                  </div>
                  <div className="text-sm text-gray-600">Local Numbers</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {syncInfo.results?.retellNumbers || 0}
                  </div>
                  <div className="text-sm text-gray-600">Retell Numbers</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {syncInfo.results?.syncedNumbers || 0}
                  </div>
                  <div className="text-sm text-gray-600">Synced</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${syncInfo.results?.discrepancies > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {syncInfo.results?.discrepancies || 0}
                  </div>
                  <div className="text-sm text-gray-600">Discrepancies</div>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <div className="text-sm text-gray-600">
                  Last sync: {new Date(syncInfo.lastSync).toLocaleString()}
                </div>
                {syncInfo.results?.discrepancies > 0 && (
                  <div className="text-sm text-red-600 mt-1">
                    ⚠️ Some numbers may need attention. Check console for details.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No sync performed yet. Click "Sync Now" to check status.
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>System Recommendations</CardTitle>
          <CardDescription>Suggestions to optimize your setup</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <div className="font-medium text-blue-900">Regular Sync Recommended</div>
                <div className="text-sm text-blue-800">
                  Sync number status at least once daily to prevent discrepancies
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <div className="font-medium text-green-900">Enable Automation</div>
                <div className="text-sm text-green-800">
                  Configure auto-import and auto-rotation for hands-off operation
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <div className="font-medium text-yellow-900">Monitor Call Volume</div>
                <div className="text-sm text-yellow-800">
                  Keep an eye on daily call counts to prevent spam flags
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemHealthDashboard;
