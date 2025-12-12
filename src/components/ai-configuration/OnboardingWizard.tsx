import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Phone, Settings, Zap, MessageSquare, Users, Workflow, 
  Radio, Database, Link, Shield, DollarSign, BarChart, Bot,
  CheckCircle2, Circle, Loader2, Sparkles, ChevronRight, X
} from 'lucide-react';
import { ConfigurationProgress } from './ConfigurationProgress';
import { useAIConfiguration } from '@/hooks/useAIConfiguration';
import { useToast } from '@/hooks/use-toast';
import { CONFIGURATION_INTEGRATIONS } from './ConfigurationAreaIntegrations';
import { ConfigurationStepRenderer } from './ConfigurationStepRenderer';

export interface ConfigurationArea {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'essential' | 'recommended' | 'optional';
  estimatedTime: string;
  dependencies?: string[]; // IDs of areas that must be completed first
  completed: boolean;
  skipped: boolean;
  inProgress: boolean;
}

const CONFIGURATION_AREAS: Omit<ConfigurationArea, 'completed' | 'skipped' | 'inProgress'>[] = [
  {
    id: 'phone_numbers',
    title: 'Phone Numbers',
    description: 'Purchase and configure phone numbers for calling',
    icon: <Phone className="h-5 w-5" />,
    category: 'essential',
    estimatedTime: '3-5 min',
  },
  {
    id: 'sip_trunk',
    title: 'SIP Trunking',
    description: 'Set up call connectivity with Twilio or your provider',
    icon: <Radio className="h-5 w-5" />,
    category: 'essential',
    estimatedTime: '2-3 min',
  },
  {
    id: 'dialer_settings',
    title: 'Dialer Settings',
    description: 'Configure AMD, local presence, timezone compliance',
    icon: <Settings className="h-5 w-5" />,
    category: 'recommended',
    estimatedTime: '2-3 min',
  },
  {
    id: 'campaign',
    title: 'First Campaign',
    description: 'Create your first calling campaign',
    icon: <Zap className="h-5 w-5" />,
    category: 'essential',
    estimatedTime: '3-4 min',
    dependencies: ['phone_numbers'],
  },
  {
    id: 'ai_agent',
    title: 'AI Agent',
    description: 'Create an AI voice agent for automated calling',
    icon: <Bot className="h-5 w-5" />,
    category: 'recommended',
    estimatedTime: '2-3 min',
  },
  {
    id: 'workflows',
    title: 'Follow-up Workflows',
    description: 'Automate follow-up calls and SMS sequences',
    icon: <Workflow className="h-5 w-5" />,
    category: 'recommended',
    estimatedTime: '3-5 min',
  },
  {
    id: 'number_pools',
    title: 'Number Pools',
    description: 'Organize numbers into pools for rotation',
    icon: <Database className="h-5 w-5" />,
    category: 'optional',
    estimatedTime: '2-3 min',
    dependencies: ['phone_numbers'],
  },
  {
    id: 'voice_broadcast',
    title: 'Voice Broadcast',
    description: 'Set up mass voice messaging campaigns',
    icon: <MessageSquare className="h-5 w-5" />,
    category: 'optional',
    estimatedTime: '3-4 min',
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Connect GoHighLevel, Airtable, or your CRM',
    icon: <Link className="h-5 w-5" />,
    category: 'optional',
    estimatedTime: '5-10 min',
  },
  {
    id: 'compliance',
    title: 'Compliance Settings',
    description: 'Configure DNC lists and calling restrictions',
    icon: <Shield className="h-5 w-5" />,
    category: 'recommended',
    estimatedTime: '2-3 min',
  },
  {
    id: 'budget',
    title: 'Budget & Limits',
    description: 'Set spending limits and cost controls',
    icon: <DollarSign className="h-5 w-5" />,
    category: 'recommended',
    estimatedTime: '1-2 min',
  },
  {
    id: 'lead_scoring',
    title: 'Lead Scoring',
    description: 'Configure AI-powered lead prioritization',
    icon: <BarChart className="h-5 w-5" />,
    category: 'optional',
    estimatedTime: '2-3 min',
  },
];

interface OnboardingWizardProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete, onSkip }) => {
  const [areas, setAreas] = useState<ConfigurationArea[]>(
    CONFIGURATION_AREAS.map(area => ({
      ...area,
      completed: false,
      skipped: false,
      inProgress: false,
    }))
  );
  
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [useCase, setUseCase] = useState<string>('');
  const [showUseCaseSelection, setShowUseCaseSelection] = useState(true);
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [currentAreaId, setCurrentAreaId] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState('');
  const [userInput, setUserInput] = useState('');
  
  const { toast } = useToast();
  const { executeConfiguration, isExecuting } = useAIConfiguration();

  // Calculate progress
  const totalSelected = selectedAreas.size;
  const completedCount = areas.filter(a => selectedAreas.has(a.id) && a.completed).length;
  const progress = totalSelected > 0 ? (completedCount / totalSelected) * 100 : 0;

  // Handle use case selection
  const handleUseCaseSelect = (selectedUseCase: string) => {
    setUseCase(selectedUseCase);
    setShowUseCaseSelection(false);
    
    // Auto-select recommended areas based on use case
    const recommended = getRecommendedAreas(selectedUseCase);
    setSelectedAreas(new Set(recommended));
    
    // Set AI welcome message
    setAiMessage(getWelcomeMessage(selectedUseCase));
  };

  const getRecommendedAreas = (useCase: string): string[] => {
    const base = ['phone_numbers', 'campaign', 'dialer_settings', 'budget'];
    
    switch (useCase) {
      case 'cold_calling':
        return [...base, 'ai_agent', 'workflows', 'compliance'];
      case 'solar':
        return [...base, 'ai_agent', 'workflows', 'compliance', 'lead_scoring'];
      case 'real_estate':
        return [...base, 'workflows', 'integrations'];
      case 'broadcast':
        return ['phone_numbers', 'voice_broadcast', 'budget'];
      case 'sms_only':
        return ['phone_numbers', 'campaign', 'workflows'];
      default:
        return base;
    }
  };

  const getWelcomeMessage = (useCase: string): string => {
    const messages: Record<string, string> = {
      cold_calling: "Great! For cold calling, I've selected the essential setup areas. You'll need phone numbers, a campaign, dialer settings, and an AI agent. I also recommend setting up follow-up workflows and compliance settings. Feel free to check or uncheck any areas!",
      solar: "Perfect for solar sales! I've pre-selected everything you need including local presence dialing, AMD, and lead scoring. These settings will maximize your answer rates and conversion.",
      real_estate: "Excellent! For real estate, I recommend SMS follow-ups and CRM integration. I've selected the key areas to get you started.",
      broadcast: "Voice broadcast setup! This is simpler - you mainly need phone numbers and the broadcast feature. I've selected just what you need.",
      sms_only: "SMS campaigns! You'll need phone numbers, a campaign, and workflows. No voice settings needed.",
    };
    return messages[useCase] || "I've selected the recommended setup areas for you. Check or uncheck any areas based on what you need!";
  };

  const toggleArea = (areaId: string) => {
    const newSelected = new Set(selectedAreas);
    if (newSelected.has(areaId)) {
      newSelected.delete(areaId);
    } else {
      newSelected.add(areaId);
    }
    setSelectedAreas(newSelected);
  };

  const handleStartSetup = () => {
    if (selectedAreas.size === 0) {
      toast({
        title: "No areas selected",
        description: "Please select at least one area to configure.",
        variant: "destructive",
      });
      return;
    }
    
    // Start with first selected area
    const firstArea = areas.find(a => selectedAreas.has(a.id));
    if (firstArea) {
      setCurrentAreaId(firstArea.id);
      setShowConfiguration(true);
    }
  };

  const handleAreaComplete = (areaId: string) => {
    setAreas(prev => prev.map(a => 
      a.id === areaId ? { ...a, completed: true, inProgress: false } : a
    ));
    
    // Move to next area
    const currentIndex = areas.findIndex(a => a.id === areaId);
    const nextArea = areas.slice(currentIndex + 1).find(a => selectedAreas.has(a.id) && !a.completed);
    
    if (nextArea) {
      setCurrentAreaId(nextArea.id);
    } else {
      // All done!
      setCurrentAreaId(null);
      toast({
        title: "Setup Complete! 🎉",
        description: "Your dialer system is ready to go!",
      });
      onComplete?.();
    }
  };

  const handleSkipArea = (areaId: string) => {
    setAreas(prev => prev.map(a => 
      a.id === areaId ? { ...a, skipped: true, inProgress: false } : a
    ));
    handleAreaComplete(areaId); // Move to next
  };

  const getCategoryBadge = (category: ConfigurationArea['category']) => {
    const styles = {
      essential: 'bg-red-100 text-red-800 border-red-200',
      recommended: 'bg-blue-100 text-blue-800 border-blue-200',
      optional: 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return (
      <Badge variant="outline" className={styles[category]}>
        {category}
      </Badge>
    );
  };

  if (showUseCaseSelection) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <CardTitle>Welcome to Dial Smart!</CardTitle>
          </div>
          <CardDescription>
            Let's get your dialer system set up. Choose how you'd like to proceed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* AI Setup Option */}
          <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">AI-Guided Setup (Recommended)</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-3">
                    Tell me what you need and I'll configure everything for you. Just describe your use case in plain English.
                  </p>
                  <Button 
                    onClick={() => {
                      window.location.href = '/?tab=ai-setup';
                    }}
                    className="gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Start AI Setup Assistant
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-sm text-muted-foreground">
              or choose a template
            </span>
          </div>

          {/* Template Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { id: 'cold_calling', title: 'Cold Calling / Sales', icon: <Phone />, desc: 'Outbound sales calls' },
              { id: 'solar', title: 'Solar / Home Improvement', icon: <Zap />, desc: 'Solar or home services' },
              { id: 'real_estate', title: 'Real Estate', icon: <Users />, desc: 'Property follow-ups' },
              { id: 'broadcast', title: 'Voice Broadcasts', icon: <MessageSquare />, desc: 'Mass announcements' },
              { id: 'sms_only', title: 'SMS Campaigns', icon: <MessageSquare />, desc: 'Text messaging only' },
              { id: 'custom', title: 'Custom Setup', icon: <Settings />, desc: 'I know what I need' },
            ].map(option => (
              <Button
                key={option.id}
                variant="outline"
                className="h-auto p-4 flex flex-col items-start gap-2 hover:border-primary"
                onClick={() => handleUseCaseSelect(option.id)}
              >
                <div className="flex items-center gap-2">
                  {option.icon}
                  <span className="font-semibold">{option.title}</span>
                </div>
                <span className="text-sm text-muted-foreground">{option.desc}</span>
              </Button>
            ))}
          </div>
          
          <Separator />
          
          <div className="flex justify-between">
            <Button variant="ghost" onClick={onSkip}>
              Skip Setup - I'll Configure Manually
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (showConfiguration && currentAreaId) {
    const currentArea = areas.find(a => a.id === currentAreaId);
    const integration = CONFIGURATION_INTEGRATIONS[currentAreaId];
    
    return (
      <Card className="w-full max-w-6xl mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentArea?.icon}
              <CardTitle>{currentArea?.title}</CardTitle>
              {getCategoryBadge(currentArea?.category || 'optional')}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowConfiguration(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>{currentArea?.description}</CardDescription>
          
          {integration?.instructions && (
            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                💡 <strong>Tip:</strong> {integration.instructions}
              </p>
            </div>
          )}
          
          <Progress value={progress} className="mt-3" />
          <div className="text-sm text-muted-foreground">
            Step {completedCount + 1} of {totalSelected}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Render the actual configuration component */}
          <ConfigurationStepRenderer 
            areaId={currentAreaId}
            onComplete={() => handleAreaComplete(currentAreaId)}
            onSkip={() => handleSkipArea(currentAreaId)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-6xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <CardTitle>Setup Your Dialer System</CardTitle>
            </div>
            <CardDescription className="mt-2">
              {aiMessage}
            </CardDescription>
          </div>
          <Button variant="ghost" onClick={onSkip}>
            Skip Setup
          </Button>
        </div>
        
        {selectedAreas.size > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">
                {completedCount} of {totalSelected} completed
              </span>
            </div>
            <Progress value={progress} />
          </div>
        )}
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Essential Areas */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="text-red-600">Essential</span>
            <span className="text-sm text-muted-foreground font-normal">
              (Required to start calling)
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {areas.filter(a => a.category === 'essential').map(area => (
              <ConfigurationAreaCard
                key={area.id}
                area={area}
                selected={selectedAreas.has(area.id)}
                onToggle={() => toggleArea(area.id)}
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* Recommended Areas */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="text-blue-600">Recommended</span>
            <span className="text-sm text-muted-foreground font-normal">
              (Improves performance & results)
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {areas.filter(a => a.category === 'recommended').map(area => (
              <ConfigurationAreaCard
                key={area.id}
                area={area}
                selected={selectedAreas.has(area.id)}
                onToggle={() => toggleArea(area.id)}
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* Optional Areas */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="text-gray-600">Optional</span>
            <span className="text-sm text-muted-foreground font-normal">
              (Add these anytime later)
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {areas.filter(a => a.category === 'optional').map(area => (
              <ConfigurationAreaCard
                key={area.id}
                area={area}
                selected={selectedAreas.has(area.id)}
                onToggle={() => toggleArea(area.id)}
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-muted-foreground">
            {selectedAreas.size === 0 ? (
              'Select at least one area to get started'
            ) : (
              `${selectedAreas.size} area${selectedAreas.size !== 1 ? 's' : ''} selected • Est. ${calculateTotalTime(areas, selectedAreas)}`
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowUseCaseSelection(true)}>
              Change Use Case
            </Button>
            <Button 
              onClick={handleStartSetup}
              disabled={selectedAreas.size === 0}
              className="gap-2"
            >
              Start Setup
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface ConfigurationAreaCardProps {
  area: ConfigurationArea;
  selected: boolean;
  onToggle: () => void;
}

const ConfigurationAreaCard: React.FC<ConfigurationAreaCardProps> = ({ area, selected, onToggle }) => {
  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer transition-all ${
        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
      } ${area.completed ? 'bg-green-50 border-green-200' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {area.icon}
            <h4 className="font-medium text-sm">{area.title}</h4>
            {area.completed && <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto" />}
            {area.inProgress && <Loader2 className="h-4 w-4 text-primary animate-spin ml-auto" />}
          </div>
          <p className="text-xs text-muted-foreground mb-2">{area.description}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{area.estimatedTime}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function calculateTotalTime(areas: ConfigurationArea[], selectedIds: Set<string>): string {
  const selected = areas.filter(a => selectedIds.has(a.id));
  const totalMinutes = selected.reduce((sum, area) => {
    const match = area.estimatedTime.match(/(\d+)-?(\d+)?/);
    if (match) {
      const min = parseInt(match[1]);
      const max = match[2] ? parseInt(match[2]) : min;
      return sum + (min + max) / 2;
    }
    return sum;
  }, 0);
  
  return `${Math.round(totalMinutes)} min`;
}

export default OnboardingWizard;
