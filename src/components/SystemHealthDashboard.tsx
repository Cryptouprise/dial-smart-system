
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Clock, Database } from 'lucide-react';

interface SystemHealth {
  apiStatus: 'online' | 'offline';
  databaseStatus: 'online' | 'offline';
  lastBackup: string;
}

const SystemHealthDashboard = () => {
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    apiStatus: 'online',
    databaseStatus: 'online',
    lastBackup: new Date().toISOString()
  });

  // Fix the infinite loop by using useEffect with empty dependency array
  useEffect(() => {
    // Mock system health check - only run once on mount
    const checkSystemHealth = () => {
      setSystemHealth({
        apiStatus: 'online',
        databaseStatus: 'online',
        lastBackup: new Date().toISOString()
      });
    };

    checkSystemHealth();
  }, []); // Empty dependency array prevents infinite loop

  return (
    <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-slate-200 dark:border-slate-700">
      <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
        <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100 text-sm sm:text-base lg:text-lg">
          <Database className="h-4 w-4 sm:h-5 sm:w-5" />
          System Health
        </CardTitle>
        <CardDescription className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
          Real-time system status and monitoring
        </CardDescription>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">API Status</span>
            </div>
            <Badge variant={systemHealth.apiStatus === 'online' ? 'default' : 'destructive'} className="text-xs">
              {systemHealth.apiStatus}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-600" />
              <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">Database</span>
            </div>
            <Badge variant={systemHealth.databaseStatus === 'online' ? 'default' : 'destructive'} className="text-xs">
              {systemHealth.databaseStatus}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-600" />
              <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">Last Backup</span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(systemHealth.lastBackup).toLocaleDateString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemHealthDashboard;
