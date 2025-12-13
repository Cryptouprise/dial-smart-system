import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Phone, Settings, Zap, MessageSquare, Users, Workflow, 
  Radio, Database, Link, Shield, DollarSign, BarChart, Bot,
  CheckCircle2, Circle, Loader2, Sparkles, ChevronRight, ChevronLeft, X, AlertCircle, ArrowLeft, Wrench
} from 'lucide-react';
import { ConfigurationProgress } from './ConfigurationProgress';
import { useAIConfiguration } from '@/hooks/useAIConfiguration';
import { useToast } from '@/hooks/use-toast';
import { CONFIGURATION_INTEGRATIONS } from './ConfigurationAreaIntegrations';
import { ConfigurationStepRenderer } from './ConfigurationStepRenderer';
import { QuickStartWizard } from './QuickStartWizard';

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
    id: 'ai_agent',
    title: 'AI Agent',
    description: 'Create an AI voice agent for automated calling',
    icon: <Bot className="h-5 w-5" />,
    category: 'essential',
    estimatedTime: '3-5 min',
  },
  {
    id: 'leads',
    title: 'Import Leads',
    description: 'Upload or add leads to call',
    icon: <Users className="h-5 w-5" />,
    category: 'essential',
    estimatedTime: '2-5 min',
  },
  {
    id: 'workflows',
    title: 'Follow-up Workflows',
    description: 'AI-powered workflow builder for automated follow-ups',
    icon: <Workflow className="h-5 w-5" />,
    category: 'recommended',
    estimatedTime: '3-5 min',
  },
  {
    id: 'campaign',
    title: 'First Campaign',
    description: 'Create your first calling campaign',
    icon: <Zap className="h-5 w-5" />,
    category: 'essential',
    estimatedTime: '3-4 min',
    dependencies: ['phone_numbers', 'ai_agent'],
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

const STORAGE_KEY = 'onboarding_state_v1';

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
  const [showCompletion, setShowCompletion] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [currentAreaId, setCurrentAreaId] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState('');
  const [userInput, setUserInput] = useState('');
  const [fixDialogArea, setFixDialogArea] = useState<ConfigurationArea | null>(null);
  const [cameFromCompletion, setCameFromCompletion] = useState(false);
  const [externalFixSource, setExternalFixSource] = useState<string | null>(null);
  const [hasHandledExternalFix, setHasHandledExternalFix] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  
  const { toast } = useToast();
  const { executeConfiguration, isExecuting } = useAIConfiguration();

  // Restore onboarding state from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        if (!aiMessage) {
          setAiMessage("I've selected the recommended setup areas for you. Check or uncheck any areas based on what you need!");
        }
        setHasHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw);

      if (parsed.useCase) setUseCase(parsed.useCase);
      if (Array.isArray(parsed.selectedAreaIds)) {
        setSelectedAreas(new Set(parsed.selectedAreaIds));
      }
      if (Array.isArray(parsed.areaStates)) {
        setAreas(prev =>
          prev.map(area => {
            const match = parsed.areaStates.find((a: any) => a.id === area.id);
            return match
              ? { ...area, completed: !!match.completed, skipped: !!match.skipped, inProgress: !!match.inProgress }
              : area;
          })
        );
      }
      if (typeof parsed.showUseCaseSelection === 'boolean') setShowUseCaseSelection(parsed.showUseCaseSelection);
      if (typeof parsed.showConfiguration === 'boolean') setShowConfiguration(parsed.showConfiguration);
      if (typeof parsed.showCompletion === 'boolean') setShowCompletion(parsed.showCompletion);
      if (typeof parsed.showQuickStart === 'boolean') setShowQuickStart(parsed.showQuickStart);
      if (parsed.currentAreaId) setCurrentAreaId(parsed.currentAreaId);
      if (parsed.aiMessage) setAiMessage(parsed.aiMessage);
    } catch (error) {
      console.error('Failed to load onboarding state', error);
    } finally {
      setHasHydrated(true);
    }
  }, []);

  // Persist onboarding state to localStorage
  useEffect(() => {
    if (!hasHydrated || typeof window === 'undefined') return;

    try {
      const payload = {
        useCase,
        selectedAreaIds: Array.from(selectedAreas),
        areaStates: areas.map(area => ({
          id: area.id,
          completed: area.completed,
          skipped: area.skipped,
          inProgress: area.inProgress,
        })),
        showUseCaseSelection,
        showConfiguration,
        showCompletion,
        showQuickStart,
        currentAreaId,
        aiMessage,
      };

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to save onboarding state', error);
    }
  }, [
    useCase,
    selectedAreas,
    areas,
    showUseCaseSelection,
    showConfiguration,
    showCompletion,
    showQuickStart,
    currentAreaId,
    aiMessage,
    hasHydrated,
  ]);

  // Handle direct "fix" links coming from other parts of the app (e.g. Campaign Readiness)
  useEffect(() => {
    if (hasHandledExternalFix || !hasHydrated) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const fixAreaId = params.get('fixArea');
    const source = params.get('source');

    if (!fixAreaId) return;

    const targetArea = areas.find(a => a.id === fixAreaId);
    if (!targetArea) return;

    setHasHandledExternalFix(true);
    setExternalFixSource(source);
    setSelectedAreas(prev => new Set([...prev, fixAreaId]));
    setCurrentAreaId(fixAreaId);
    setShowUseCaseSelection(false);
    setShowCompletion(false);
    setShowConfiguration(true);
  }, [areas, hasHandledExternalFix, hasHydrated]);

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
    const base = ['phone_numbers', 'sip_trunk', 'ai_agent', 'leads', 'campaign'];
    
    switch (useCase) {
      case 'cold_calling':
        return [...base, 'workflows', 'dialer_settings', 'compliance', 'budget'];
      case 'solar':
        return [...base, 'workflows', 'dialer_settings', 'compliance', 'lead_scoring', 'budget'];
      case 'real_estate':
        return [...base, 'workflows', 'integrations', 'budget'];
      case 'broadcast':
        return ['phone_numbers', 'sip_trunk', 'voice_broadcast', 'leads', 'budget'];
      case 'sms_only':
        return ['phone_numbers', 'leads', 'workflows'];
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
      // All done - show completion screen
      setCurrentAreaId(null);
      setShowConfiguration(false);
      setShowCompletion(true);
    }
  };

  const handleSkipArea = (areaId: string) => {
    setAreas(prev => prev.map(a => 
      a.id === areaId ? { ...a, skipped: true, inProgress: false } : a
    ));
    handleAreaComplete(areaId); // Move to next
  };

  // Go back to previous step
  const handleGoBack = () => {
    if (!currentAreaId) return;
    
    const selectedAreaIds = areas.filter(a => selectedAreas.has(a.id)).map(a => a.id);
    const currentIndex = selectedAreaIds.indexOf(currentAreaId);
    
    if (currentIndex > 0) {
      // Go to previous area
      setCurrentAreaId(selectedAreaIds[currentIndex - 1]);
    } else {
      // First step - go back to checklist
      setCurrentAreaId(null);
      setShowConfiguration(false);
    }
  };

  // Allow direct configuration of any area by clicking Configure button
  const handleConfigureArea = (areaId: string) => {
    // Make sure this area is selected
    if (!selectedAreas.has(areaId)) {
      setSelectedAreas(prev => new Set([...prev, areaId]));
    }
    setCurrentAreaId(areaId);
    setShowConfiguration(true);
  };

  // Get fix guidance for an area
  const getFixGuidance = (areaId: string): { title: string; steps: string[]; tip: string } => {
    const guidance: Record<string, { title: string; steps: string[]; tip: string }> = {
      phone_numbers: {
        title: "You need phone numbers to make calls",
        steps: [
          "Enter an area code (e.g., 212 for New York)",
          "Choose how many numbers you want (3-5 recommended)",
          "Click 'Purchase' - numbers are ready instantly"
        ],
        tip: "Start with 3-5 numbers for rotation to avoid spam flags"
      },
      sip_trunk: {
        title: "SIP trunk connects your calls to the network",
        steps: [
          "If using Retell AI numbers, you can skip this",
          "If using Twilio, enter your Account SID and Auth Token",
          "Click 'Connect' to link your account"
        ],
        tip: "Most users can skip this - Retell handles it automatically"
      },
      ai_agent: {
        title: "Create an AI agent to handle calls",
        steps: [
          "Write a system prompt (what the AI should say/do)",
          "Set the greeting message",
          "Choose a voice and create the agent"
        ],
        tip: "Keep prompts clear and focused on your main goal"
      },
      leads: {
        title: "Import leads to call",
        steps: [
          "Prepare a CSV with phone numbers",
          "Upload using the importer",
          "Map columns (auto-detected)"
        ],
        tip: "Start with a small test batch first"
      },
      campaign: {
        title: "Create a campaign to organize your calls",
        steps: [
          "Give your campaign a name",
          "Select an AI agent",
          "Set calling hours and add leads"
        ],
        tip: "You can create multiple campaigns for different purposes"
      },
      workflows: {
        title: "Set up automated follow-ups",
        steps: [
          "Use AI Builder: describe what you want",
          "Or manually add steps",
          "Assign to a campaign"
        ],
        tip: "Try the AI builder - just describe your workflow in plain English"
      },
      budget: {
        title: "Control your spending",
        steps: [
          "Set a daily limit (e.g., $50/day)",
          "Set a monthly limit",
          "Choose pause behavior when hit"
        ],
        tip: "Start conservative and increase as you learn"
      }
    };
    return guidance[areaId] || { title: "Configure this setting", steps: ["Complete the configuration form"], tip: "" };
  };

  // Handle fix button click - show dialog first
  const handleFixClick = (area: ConfigurationArea) => {
    setFixDialogArea(area);
  };

  // Proceed to fix after dialog
  const proceedToFix = () => {
    if (!fixDialogArea) return;
    
    setSelectedAreas(prev => new Set([...prev, fixDialogArea.id]));
    setCurrentAreaId(fixDialogArea.id);
    setShowCompletion(false);
    setShowConfiguration(true);
    setCameFromCompletion(true);
    setFixDialogArea(null);
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

  // Completion screen
  if (showCompletion) {
    const completedAreas = areas.filter(a => selectedAreas.has(a.id) && a.completed && !a.skipped);
    const skippedAreas = areas.filter(a => selectedAreas.has(a.id) && a.skipped);
    const essentialMissing = areas.filter(a => a.category === 'essential' && !a.completed);
    const hasAllEssentials = essentialMissing.length === 0;
    
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <CardTitle className="text-2xl">Setup Complete! 🎉</CardTitle>
          </div>
          <CardDescription className="text-base">
            {hasAllEssentials 
              ? "Your dialer system is ready to make calls!"
              : "You've completed setup, but some essential items were skipped."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Completed Items */}
          {completedAreas.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                Configured ({completedAreas.length})
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {completedAreas.map(area => (
                  <div key={area.id} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
                    {area.icon}
                    <span className="text-sm">{area.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Skipped Items */}
          {skippedAreas.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-yellow-600">
                <AlertCircle className="h-5 w-5" />
                Skipped ({skippedAreas.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {skippedAreas.map(area => (
                  <div key={area.id} className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded border border-yellow-200 dark:border-yellow-800">
                    <span className="flex-shrink-0">{area.icon}</span>
                    <span className="text-sm flex-1">{area.title}</span>
                    <Button 
                      type="button"
                      variant="secondary" 
                      size="sm" 
                      className="flex-shrink-0 h-7 text-xs gap-1"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleFixClick(area);
                      }}
                    >
                      <Wrench className="h-3 w-3" />
                      Fix
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Essential Missing Warning */}
          {!hasAllEssentials && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
                ⚠️ Essential Items Not Configured
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                These are required to start making calls:
              </p>
              <div className="space-y-3">
                {essentialMissing.map(area => (
                  <div key={area.id} className="flex items-center justify-between gap-2 flex-wrap bg-red-100 dark:bg-red-900/30 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="flex-shrink-0">{area.icon}</span>
                      <div>
                        <span className="text-sm font-medium">{area.title}</span>
                        <p className="text-xs text-red-600 dark:text-red-400">Required to make calls</p>
                      </div>
                    </div>
                    <Button 
                      type="button"
                      size="sm" 
                      variant="destructive"
                      className="flex-shrink-0 gap-1"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleFixClick(area);
                      }}
                    >
                      <Wrench className="h-4 w-4" />
                      Fix This
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Next Steps */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
              🚀 Next Steps
            </h3>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              {hasAllEssentials ? (
                <>
                  <li>• Go to <strong>Campaigns</strong> to start your first campaign</li>
                  <li>• Check <strong>Live Monitor</strong> to see calls in real-time</li>
                  <li>• Review <strong>Analytics</strong> to track performance</li>
                </>
              ) : (
                <>
                  <li>• Configure the missing essential items above</li>
                  <li>• Then you'll be ready to start calling</li>
                </>
              )}
            </ul>
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between gap-4 pt-2">
            <Button 
              type="button"
              variant="outline" 
              onClick={(e) => {
                e.preventDefault();
                setShowCompletion(false);
                setShowUseCaseSelection(false);
              }}
            >
              Back to Setup Checklist
            </Button>
            <Button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (onComplete) {
                  onComplete();
                } else {
                  // Fallback: navigate to overview
                  window.location.href = '/?tab=overview';
                }
              }}
            >
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (showUseCaseSelection) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="p-3 rounded-full bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Welcome to Dial Smart!</CardTitle>
          <CardDescription className="text-base">
            Let's get you making calls in minutes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Quick Start - Primary CTA */}
          <Button 
            size="lg"
            className="w-full h-auto py-4 gap-3"
            onClick={() => {
              setShowUseCaseSelection(false);
              setShowQuickStart(true);
            }}
          >
            <Zap className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Quick Start (4 steps)</div>
              <div className="text-xs opacity-80">Phone Numbers → AI Agent → Leads → Launch</div>
            </div>
          </Button>

          <div className="relative py-2">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
              or
            </span>
          </div>

          {/* Secondary options */}
          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline"
              className="h-auto py-3"
              onClick={() => {
                handleUseCaseSelect('custom');
              }}
            >
              <div className="text-center">
                <Settings className="h-5 w-5 mx-auto mb-1" />
                <div className="text-sm font-medium">Custom Setup</div>
                <div className="text-xs text-muted-foreground">Pick what you need</div>
              </div>
            </Button>
            <Button 
              variant="ghost"
              className="h-auto py-3"
              onClick={onSkip}
            >
              <div className="text-center">
                <ChevronRight className="h-5 w-5 mx-auto mb-1" />
                <div className="text-sm font-medium">Skip for Now</div>
                <div className="text-xs text-muted-foreground">I'll explore myself</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Quick Start linear wizard (simpler flow)
  if (showQuickStart) {
    return <QuickStartWizard onComplete={onComplete} onSkip={onSkip} />;
  }

  if (showConfiguration && currentAreaId) {
    const currentArea = areas.find(a => a.id === currentAreaId);
    const integration = CONFIGURATION_INTEGRATIONS[currentAreaId];
    
    return (
      <Card className="w-full max-w-6xl mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleGoBack} className="gap-1">
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                {currentArea?.icon}
                <CardTitle>{currentArea?.title}</CardTitle>
                {getCategoryBadge(currentArea?.category || 'optional')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {externalFixSource === 'campaign_readiness' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (window.history.length > 1) {
                      window.history.back();
                    } else {
                      window.location.href = '/?tab=campaigns';
                    }
                  }}
                  className="gap-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Campaign Readiness
                </Button>
              )}
              {cameFromCompletion && (
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => {
                    setShowConfiguration(false);
                    setCurrentAreaId(null);
                    setShowCompletion(true);
                    setCameFromCompletion(false);
                  }}
                  className="gap-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Return to Summary
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => {
                setShowConfiguration(false);
                setCurrentAreaId(null);
                setCameFromCompletion(false);
              }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CardDescription>{currentArea?.description}</CardDescription>
          
          {/* Reminder banner when fixing from completion */}
          {cameFromCompletion && (
            <div className="mt-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <p className="text-sm text-primary">
                <strong>Fixing:</strong> {currentArea?.title} - Complete this step to resolve the issue, then return to the summary.
              </p>
            </div>
          )}

          {/* Guidance when coming from external readiness checks (e.g. Campaign Wizard) */}
          {externalFixSource && currentAreaId && (
            <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Fixing a campaign readiness issue:</strong> Follow these steps to complete {currentArea?.title.toLowerCase()}.
              </p>
              <div className="text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold mb-1">What you'll do:</p>
                <ol className="list-decimal list-inside space-y-1">
                  {getFixGuidance(currentAreaId).steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          
          {integration?.instructions && (
            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                💡 <strong>Tip:</strong> {integration.instructions}
              </p>
            </div>
          )}
          
          <Progress value={progress} className="mt-3" />
          <div className="text-sm text-muted-foreground">
            Step {areas.filter(a => selectedAreas.has(a.id)).findIndex(a => a.id === currentAreaId) + 1} of {totalSelected}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ConfigurationStepRenderer 
            areaId={currentAreaId}
            onComplete={() => {
              handleAreaComplete(currentAreaId);
              // If this was opened from a campaign readiness fix, send the user back there
              if (externalFixSource === 'campaign_readiness') {
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  window.location.href = '/?tab=campaigns';
                }
                return;
              }
              // If we came from completion screen, go back there
              if (cameFromCompletion) {
                setCameFromCompletion(false);
                // After a brief delay to let state update, show completion
                setTimeout(() => setShowCompletion(true), 100);
              }
            }}
            onSkip={() => handleSkipArea(currentAreaId)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
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
                onConfigure={() => handleConfigureArea(area.id)}
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
                onConfigure={() => handleConfigureArea(area.id)}
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
                onConfigure={() => handleConfigureArea(area.id)}
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

    {/* Fix Dialog */}
    <Dialog open={!!fixDialogArea} onOpenChange={() => setFixDialogArea(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            {fixDialogArea?.title}
          </DialogTitle>
          <DialogDescription>
            {fixDialogArea && getFixGuidance(fixDialogArea.id).title}
          </DialogDescription>
        </DialogHeader>
        
        {fixDialogArea && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">What you'll do:</h4>
              <ol className="text-sm space-y-2">
                {getFixGuidance(fixDialogArea.id).steps.map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            
            {getFixGuidance(fixDialogArea.id).tip && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Tip:</strong> {getFixGuidance(fixDialogArea.id).tip}
                </p>
              </div>
            )}
          </div>
        )}
        
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => setFixDialogArea(null)}>
            Cancel
          </Button>
          <Button onClick={proceedToFix} className="gap-2">
            <ChevronRight className="h-4 w-4" />
            Go Fix This
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

interface ConfigurationAreaCardProps {
  area: ConfigurationArea;
  selected: boolean;
  onToggle: () => void;
  onConfigure: () => void;
}

const ConfigurationAreaCard: React.FC<ConfigurationAreaCardProps> = ({ area, selected, onToggle, onConfigure }) => {
  return (
    <div
      className={`border rounded-lg p-4 transition-all ${
        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
      } ${area.completed ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : ''}`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="mt-1 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {area.icon}
            <h4 className="font-medium text-sm">{area.title}</h4>
            {area.completed && <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto" />}
            {area.inProgress && <Loader2 className="h-4 w-4 text-primary animate-spin ml-auto" />}
          </div>
          <p className="text-xs text-muted-foreground mb-2">{area.description}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{area.estimatedTime}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={(e) => {
                e.stopPropagation();
                onConfigure();
              }}
            >
              Configure
              <ChevronRight className="h-3 w-3" />
            </Button>
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
