import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, Users, DollarSign, Clock, TrendingUp, CheckCircle, Voicemail, PhoneOff, Calendar } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface SimulationConfig {
  leadCount: number;
  dailyGoalAppointments: number;
  costPerAppointmentTarget: number;
  phoneNumbersNeeded: number;
  enablePredictiveDialing: boolean;
}

interface SimulationResults {
  callsMade: number;
  connected: number;
  voicemails: number;
  appointments: number;
  totalCost: number;
  durationMinutes: number;
}

interface DemoSimulationDashboardProps {
  config: SimulationConfig;
  campaignType: string;
  scrapedData: any;
  onComplete: (results: SimulationResults) => void;
}

export const DemoSimulationDashboard = ({
  config,
  campaignType,
  scrapedData,
  onComplete,
}: DemoSimulationDashboardProps) => {
  const [callsMade, setCallsMade] = useState(0);
  const [connected, setConnected] = useState(0);
  const [voicemails, setVoicemails] = useState(0);
  const [noAnswer, setNoAnswer] = useState(0);
  const [appointments, setAppointments] = useState(0);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [pipelineLeads, setPipelineLeads] = useState<{ stage: string; name: string }[]>([]);
  
  const simulationRef = useRef<NodeJS.Timeout | null>(null);
  const timeRef = useRef<NodeJS.Timeout | null>(null);

  const stages = ['new', 'follow_up', 'interested', 'hot_lead', 'appointment'];
  const fakeNames = [
    'John S.', 'Sarah M.', 'Mike D.', 'Emily R.', 'Chris T.',
    'Amanda L.', 'David K.', 'Jessica H.', 'Robert P.', 'Lisa N.',
    'James W.', 'Michelle B.', 'Kevin C.', 'Ashley G.', 'Brian F.',
  ];

  useEffect(() => {
    const targetCalls = config.leadCount;
    const simulationDuration = 15000; // 15 seconds real time for full simulation
    const updateInterval = 100; // Update every 100ms
    const callsPerUpdate = targetCalls / (simulationDuration / updateInterval);
    
    // Time progression (4x time-lapse)
    const estimatedRealMinutes = targetCalls / 15; // ~15 calls per minute
    const minutesPerUpdate = estimatedRealMinutes / (simulationDuration / updateInterval);

    simulationRef.current = setInterval(() => {
      setCallsMade(prev => {
        const next = Math.min(prev + callsPerUpdate, targetCalls);
        
        // Simulate outcomes
        if (Math.random() < 0.10) { // 10% answer rate
          setConnected(c => c + 1);
          if (Math.random() < 0.15) { // 15% of answers = appointment
            setAppointments(a => a + 1);
            setPipelineLeads(leads => [
              { stage: 'appointment', name: fakeNames[Math.floor(Math.random() * fakeNames.length)] },
              ...leads.slice(0, 19),
            ]);
          } else if (Math.random() < 0.4) {
            const stage = stages[Math.floor(Math.random() * 4)];
            setPipelineLeads(leads => [
              { stage, name: fakeNames[Math.floor(Math.random() * fakeNames.length)] },
              ...leads.slice(0, 19),
            ]);
          }
        } else if (Math.random() < 0.25) { // 25% voicemail
          setVoicemails(v => v + 1);
        } else {
          setNoAnswer(n => n + 1);
        }
        
        // Update cost (~$0.07 per call attempt)
        setTotalCost(c => c + 0.07 * callsPerUpdate);
        
        if (next >= targetCalls) {
          setIsComplete(true);
          if (simulationRef.current) clearInterval(simulationRef.current);
        }
        
        return next;
      });
      
      setElapsedMinutes(prev => prev + minutesPerUpdate);
    }, updateInterval);

    return () => {
      if (simulationRef.current) clearInterval(simulationRef.current);
      if (timeRef.current) clearInterval(timeRef.current);
    };
  }, [config.leadCount]);

  const handleComplete = () => {
    onComplete({
      callsMade: Math.round(callsMade),
      connected,
      voicemails,
      appointments,
      totalCost: Math.round(totalCost * 100) / 100,
      durationMinutes: Math.round(elapsedMinutes),
    });
  };

  const progress = (callsMade / config.leadCount) * 100;
  const costPerAppointment = appointments > 0 ? totalCost / appointments : 0;

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background to-primary/5">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Campaign Simulation</h1>
            <p className="text-muted-foreground">
              {scrapedData?.business_name} - {campaignType.replace(/_/g, ' ')}
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary">
            <Clock className="h-4 w-4" />
            <span className="font-mono text-sm">4x Time-lapse</span>
          </div>
        </div>

        {/* Progress */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Campaign Progress</span>
            <span className="font-mono">{Math.round(callsMade).toLocaleString()} / {config.leadCount.toLocaleString()}</span>
          </div>
          <Progress value={progress} className="h-3" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>Elapsed: {formatTime(elapsedMinutes)}</span>
            <span>Cost: ${totalCost.toFixed(2)}</span>
          </div>
        </Card>

        {/* Tri-Panel Dashboard */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Stats Panel */}
          <Card className="p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Live Stats
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <StatBox icon={Phone} label="Calls Made" value={Math.round(callsMade)} color="text-blue-500" />
              <StatBox icon={CheckCircle} label="Connected" value={connected} color="text-green-500" />
              <StatBox icon={Voicemail} label="Voicemails" value={voicemails} color="text-yellow-500" />
              <StatBox icon={PhoneOff} label="No Answer" value={noAnswer} color="text-muted-foreground" />
              <StatBox icon={Calendar} label="Appointments" value={appointments} color="text-primary" highlighted />
              <StatBox icon={Users} label="Positive" value={connected} color="text-green-500" />
            </div>
          </Card>

          {/* Cost Tracker */}
          <Card className="p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Cost Tracker
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                <span className="text-sm">Total Spent</span>
                <span className="text-2xl font-bold">${totalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                <span className="text-sm">Cost per Appointment</span>
                <span className={`text-xl font-bold ${costPerAppointment <= config.costPerAppointmentTarget ? 'text-green-500' : 'text-yellow-500'}`}>
                  ${costPerAppointment.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                <span className="text-sm">Cost per Connect</span>
                <span className="text-lg font-medium">
                  ${connected > 0 ? (totalCost / connected).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          </Card>

          {/* Pipeline Preview */}
          <Card className="p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Pipeline Updates
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pipelineLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Waiting for leads...
                </p>
              ) : (
                pipelineLeads.map((lead, i) => (
                  <div 
                    key={i} 
                    className={`flex items-center gap-2 p-2 rounded text-sm animate-in slide-in-from-left-2 ${
                      lead.stage === 'appointment' ? 'bg-primary/20 text-primary' : 'bg-muted/50'
                    }`}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    {lead.stage === 'appointment' ? (
                      <Calendar className="h-3 w-3" />
                    ) : (
                      <CheckCircle className="h-3 w-3" />
                    )}
                    <span className="font-medium">{lead.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto capitalize">
                      {lead.stage.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Complete Button */}
        {isComplete && (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 text-green-500">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Campaign Complete!</span>
            </div>
            <div>
              <Button size="lg" onClick={handleComplete} className="gap-2">
                <TrendingUp className="h-4 w-4" />
                See ROI Analysis
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatBox = ({ 
  icon: Icon, 
  label, 
  value, 
  color,
  highlighted = false,
}: { 
  icon: any; 
  label: string; 
  value: number;
  color: string;
  highlighted?: boolean;
}) => (
  <div className={`p-3 rounded-lg ${highlighted ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-muted/50'}`}>
    <div className="flex items-center gap-2 mb-1">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
    <div className={`text-2xl font-bold ${highlighted ? 'text-primary' : ''}`}>
      {value.toLocaleString()}
    </div>
  </div>
);
