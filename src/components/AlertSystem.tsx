
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, AlertTriangle, Info, CheckCircle, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: string;
  dismissed: boolean;
  actionable?: boolean;
  action?: () => void;
  actionLabel?: string;
}

interface AlertSystemProps {
  numbers: any[];
}

const AlertSystem = ({ numbers }: AlertSystemProps) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const generateAlerts = () => {
      const newAlerts: Alert[] = [];

      // High volume alerts
      const highVolumeNumbers = numbers.filter(n => n.daily_calls > 45);
      if (highVolumeNumbers.length > 0) {
        newAlerts.push({
          id: 'high-volume-' + Date.now(),
          type: 'warning',
          title: 'High Volume Numbers Detected',
          message: `${highVolumeNumbers.length} numbers are approaching the 50-call limit`,
          timestamp: new Date().toISOString(),
          dismissed: false,
          actionable: true,
          action: () => {
            toast({
              title: "Rotation Suggested",
              description: "Consider rotating high-volume numbers to prevent quarantine",
            });
          },
          actionLabel: 'Suggest Rotation'
        });
      }

      // Quarantine alerts
      const recentlyQuarantined = numbers.filter(n => 
        n.status === 'quarantined' && 
        new Date(n.updated_at) > new Date(Date.now() - 60 * 60 * 1000) // Last hour
      );
      if (recentlyQuarantined.length > 0) {
        newAlerts.push({
          id: 'quarantine-' + Date.now(),
          type: 'error',
          title: 'Numbers Recently Quarantined',
          message: `${recentlyQuarantined.length} numbers were quarantined in the last hour`,
          timestamp: new Date().toISOString(),
          dismissed: false,
          actionable: true,
          action: () => {
            toast({
              title: "Check Spam Protection",
              description: "Review spam detection settings and consider adjusting thresholds",
            });
          },
          actionLabel: 'Review Settings'
        });
      }

      // Low pool alerts
      const availableNumbers = numbers.filter(n => n.status === 'active').length;
      if (availableNumbers < 10) {
        newAlerts.push({
          id: 'low-pool-' + Date.now(),
          type: 'warning',
          title: 'Low Number Pool',
          message: `Only ${availableNumbers} active numbers remaining`,
          timestamp: new Date().toISOString(),
          dismissed: false,
          actionable: true,
          action: () => {
            toast({
              title: "Purchase More Numbers",
              description: "Consider purchasing additional numbers to maintain pool size",
            });
          },
          actionLabel: 'Buy Numbers'
        });
      }

      // Rotation success alerts
      const rotationHistory = JSON.parse(localStorage.getItem('rotation-history') || '[]');
      const recentRotations = rotationHistory.filter((r: any) => 
        new Date(r.timestamp) > new Date(Date.now() - 30 * 60 * 1000) // Last 30 minutes
      );
      if (recentRotations.length > 0) {
        newAlerts.push({
          id: 'rotation-success-' + Date.now(),
          type: 'success',
          title: 'Rotation Completed',
          message: `${recentRotations.length} rotation(s) completed successfully`,
          timestamp: new Date().toISOString(),
          dismissed: false
        });
      }

      // Update alerts, removing duplicates
      setAlerts(prevAlerts => {
        const existingIds = prevAlerts.map(a => a.id);
        const filteredNew = newAlerts.filter(a => !existingIds.includes(a.id));
        return [...prevAlerts.filter(a => !a.dismissed), ...filteredNew];
      });
    };

    generateAlerts();
    const interval = setInterval(generateAlerts, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [numbers, toast]);

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.map(a => 
      a.id === alertId ? { ...a, dismissed: true } : a
    ));
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4" />;
      case 'info':
        return <Info className="h-4 w-4" />;
      case 'success':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getAlertVariant = (type: string) => {
    switch (type) {
      case 'warning':
        return 'secondary';
      case 'error':
        return 'destructive';
      case 'success':
        return 'default';
      default:
        return 'outline';
    }
  };

  const activeAlerts = alerts.filter(a => !a.dismissed);

  if (activeAlerts.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          System Alerts ({activeAlerts.length})
        </CardTitle>
        <CardDescription>Important notifications about your number management system</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activeAlerts.map((alert) => (
            <div key={alert.id} className="flex items-start justify-between p-3 border rounded-lg">
              <div className="flex items-start gap-3">
                <Badge variant={getAlertVariant(alert.type)} className="mt-0.5">
                  {getAlertIcon(alert.type)}
                </Badge>
                <div className="flex-1">
                  <h4 className="font-medium">{alert.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(alert.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {alert.actionable && alert.action && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={alert.action}
                  >
                    {alert.actionLabel}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissAlert(alert.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AlertSystem;
