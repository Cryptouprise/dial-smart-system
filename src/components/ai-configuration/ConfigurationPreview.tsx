import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, Clock, Sparkles, Phone, MessageSquare, 
  Settings, User, Calendar, DollarSign, AlertCircle 
} from 'lucide-react';

export interface ConfigurationItem {
  type: 'campaign' | 'agent' | 'workflow' | 'setting';
  action: 'create' | 'update' | 'delete';
  name: string;
  details: Record<string, any>;
  icon?: React.ReactNode;
}

export interface ConfigurationPlan {
  items: ConfigurationItem[];
  estimatedTime: number; // seconds
  estimatedCost?: number;
  warnings?: string[];
}

interface ConfigurationPreviewProps {
  open: boolean;
  plan: ConfigurationPlan | null;
  onCancel: () => void;
  onProceed: () => void;
  loading?: boolean;
}

const getItemIcon = (type: string) => {
  switch (type) {
    case 'campaign':
      return <Phone className="h-5 w-5" />;
    case 'agent':
      return <User className="h-5 w-5" />;
    case 'workflow':
      return <MessageSquare className="h-5 w-5" />;
    case 'setting':
      return <Settings className="h-5 w-5" />;
    default:
      return <Sparkles className="h-5 w-5" />;
  }
};

const getActionColor = (action: string) => {
  switch (action) {
    case 'create':
      return 'bg-green-500';
    case 'update':
      return 'bg-blue-500';
    case 'delete':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
};

const formatDetail = (key: string, value: any): string => {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
};

export const ConfigurationPreview: React.FC<ConfigurationPreviewProps> = ({
  open,
  plan,
  onCancel,
  onProceed,
  loading = false
}) => {
  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Configuration Preview
          </DialogTitle>
          <DialogDescription>
            Review what I'm about to configure before proceeding
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Actions</p>
                    <p className="text-2xl font-bold">{plan.items.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Est. Time</p>
                    <p className="text-2xl font-bold">{plan.estimatedTime}s</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {plan.estimatedCost !== undefined && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Est. Cost</p>
                      <p className="text-2xl font-bold">${plan.estimatedCost.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Warnings */}
          {plan.warnings && plan.warnings.length > 0 && (
            <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <CardContent className="p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                      Warnings
                    </p>
                    <ul className="space-y-1">
                      {plan.warnings.map((warning, idx) => (
                        <li key={idx} className="text-sm text-yellow-800 dark:text-yellow-200">
                          • {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Configuration Items */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">What I'll Configure:</h3>
            
            {plan.items.map((item, idx) => (
              <Card key={idx} className="border-l-4" style={{ borderLeftColor: getActionColor(item.action).replace('bg-', '') }}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${getActionColor(item.action)} text-white`}>
                      {getItemIcon(item.type)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="capitalize">
                          {item.action}
                        </Badge>
                        <Badge variant="secondary" className="capitalize">
                          {item.type}
                        </Badge>
                      </div>
                      
                      <h4 className="font-semibold mb-2">{item.name}</h4>
                      
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        {Object.entries(item.details).map(([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <span className="text-muted-foreground capitalize">
                              {key.replace(/_/g, ' ')}:
                            </span>
                            <span className="font-medium">
                              {formatDetail(key, value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Timeline Preview */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4" />
                <span className="font-semibold">Execution Order:</span>
              </div>
              <div className="space-y-2">
                {plan.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground font-mono">
                      {idx + 1}.
                    </span>
                    <span className="capitalize">{item.action}</span>
                    <span className="text-muted-foreground">{item.type}:</span>
                    <span className="font-medium">{item.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onProceed} disabled={loading}>
            {loading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Proceed with Configuration
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfigurationPreview;
