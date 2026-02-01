import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Phone, Users, DollarSign, Clock, TrendingUp, CheckCircle, Voicemail, PhoneOff, Calendar,
  UserX, MessageSquare, ThumbsDown, Ban, Flame, Send, HelpCircle, PhoneMissed
} from 'lucide-react';
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

// Realistic disposition buckets
interface DispositionCounts {
  callDropped: number;      // 60% of connected - hung up quick
  notInterested: number;    // Not a fit
  dnc: number;              // Do Not Call
  followUp: number;         // Schedule callback
  wantHuman: number;        // Transfer request
  potentialProspect: number;// Warm lead
  hotLead: number;          // Ready to buy
  sendInfo: number;         // Send more info
  wrongNumber: number;      // Bad number
  appointment: number;      // Booked!
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
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [pipelineLeads, setPipelineLeads] = useState<{ stage: string; name: string; icon?: string }[]>([]);
  
  // Realistic disposition tracking
  const [dispositions, setDispositions] = useState<DispositionCounts>({
    callDropped: 0,
    notInterested: 0,
    dnc: 0,
    followUp: 0,
    wantHuman: 0,
    potentialProspect: 0,
    hotLead: 0,
    sendInfo: 0,
    wrongNumber: 0,
    appointment: 0,
  });
  
  const simulationRef = useRef<NodeJS.Timeout | null>(null);

  const fakeNames = [
    'John S.', 'Sarah M.', 'Mike D.', 'Emily R.', 'Chris T.',
    'Amanda L.', 'David K.', 'Jessica H.', 'Robert P.', 'Lisa N.',
    'James W.', 'Michelle B.', 'Kevin C.', 'Ashley G.', 'Brian F.',
    'Nicole V.', 'Andrew Z.', 'Rachel Q.', 'Tyler O.', 'Megan I.',
  ];

  useEffect(() => {
    const targetCalls = config.leadCount;
    const simulationDuration = 20000; // 20 seconds for full simulation
    const updateInterval = 80; // Update every 80ms for smooth animation
    const callsPerUpdate = targetCalls / (simulationDuration / updateInterval);
    
    // Time progression (4x time-lapse)
    const estimatedRealMinutes = targetCalls / 15; // ~15 calls per minute
    const minutesPerUpdate = estimatedRealMinutes / (simulationDuration / updateInterval);

    simulationRef.current = setInterval(() => {
      setCallsMade(prev => {
        const next = Math.min(prev + callsPerUpdate, targetCalls);
        
        // REALISTIC SIMULATION:
        // 10% pickup rate
        if (Math.random() < 0.10) {
          setConnected(c => c + 1);
          
          // 60% of pickups are "call dropped" (< 30 sec, hung up)
          if (Math.random() < 0.60) {
            setDispositions(d => ({ ...d, callDropped: d.callDropped + 1 }));
            setPipelineLeads(leads => [
              { stage: 'dropped', name: fakeNames[Math.floor(Math.random() * fakeNames.length)], icon: 'dropped' },
              ...leads.slice(0, 24),
            ]);
          } else {
            // 40% of pickups are real conversations - distribute across dispositions
            const rand = Math.random();
            let disposition: keyof DispositionCounts;
            let stage: string;
            let icon: string;
            
            if (rand < 0.08) {
              // 8% → Appointment booked!
              disposition = 'appointment';
              stage = '🎉 APPOINTMENT';
              icon = 'appointment';
            } else if (rand < 0.18) {
              // 10% → Hot Lead
              disposition = 'hotLead';
              stage = '🔥 Hot Lead';
              icon = 'hot';
            } else if (rand < 0.30) {
              // 12% → Potential Prospect
              disposition = 'potentialProspect';
              stage = 'Potential Prospect';
              icon = 'prospect';
            } else if (rand < 0.42) {
              // 12% → Follow Up
              disposition = 'followUp';
              stage = 'Follow Up';
              icon = 'followup';
            } else if (rand < 0.52) {
              // 10% → Send Info
              disposition = 'sendInfo';
              stage = 'Send Info';
              icon = 'info';
            } else if (rand < 0.60) {
              // 8% → Want Human
              disposition = 'wantHuman';
              stage = 'Transfer Requested';
              icon = 'human';
            } else if (rand < 0.75) {
              // 15% → Not Interested
              disposition = 'notInterested';
              stage = 'Not Interested';
              icon = 'no';
            } else if (rand < 0.85) {
              // 10% → DNC
              disposition = 'dnc';
              stage = 'DNC';
              icon = 'dnc';
            } else {
              // 15% → Wrong Number
              disposition = 'wrongNumber';
              stage = 'Wrong Number';
              icon = 'wrong';
            }
            
            setDispositions(d => ({ ...d, [disposition]: d[disposition] + 1 }));
            setPipelineLeads(leads => [
              { stage, name: fakeNames[Math.floor(Math.random() * fakeNames.length)], icon },
              ...leads.slice(0, 24),
            ]);
          }
        } else if (Math.random() < 0.35) {
          // 35% voicemail
          setVoicemails(v => v + 1);
        } else {
          // 55% no answer
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
    };
  }, [config.leadCount]);

  const handleComplete = () => {
    onComplete({
      callsMade: Math.round(callsMade),
      connected,
      voicemails,
      appointments: dispositions.appointment,
      totalCost: Math.round(totalCost * 100) / 100,
      durationMinutes: Math.round(elapsedMinutes),
    });
  };

  const progress = (callsMade / config.leadCount) * 100;
  const positiveOutcomes = dispositions.appointment + dispositions.hotLead + dispositions.potentialProspect + dispositions.followUp + dispositions.sendInfo;
  const costPerAppointment = dispositions.appointment > 0 ? totalCost / dispositions.appointment : 0;

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getIconForStage = (icon?: string) => {
    switch (icon) {
      case 'appointment': return <Calendar className="h-3 w-3 text-primary" />;
      case 'hot': return <Flame className="h-3 w-3 text-orange-500" />;
      case 'prospect': return <Users className="h-3 w-3 text-blue-500" />;
      case 'followup': return <Clock className="h-3 w-3 text-yellow-500" />;
      case 'info': return <Send className="h-3 w-3 text-cyan-500" />;
      case 'human': return <MessageSquare className="h-3 w-3 text-purple-500" />;
      case 'no': return <ThumbsDown className="h-3 w-3 text-muted-foreground" />;
      case 'dnc': return <Ban className="h-3 w-3 text-red-500" />;
      case 'wrong': return <HelpCircle className="h-3 w-3 text-muted-foreground" />;
      case 'dropped': return <PhoneMissed className="h-3 w-3 text-muted-foreground" />;
      default: return <CheckCircle className="h-3 w-3" />;
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background to-primary/5">
      <div className="max-w-7xl mx-auto space-y-6">
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

        {/* Main Dashboard Grid */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Call Stats - Compact */}
          <Card className="p-4 lg:col-span-3">
            <h3 className="font-semibold flex items-center gap-2 mb-3">
              <Phone className="h-4 w-4 text-primary" />
              Call Stats
            </h3>
            <div className="space-y-2">
              <StatRow icon={Phone} label="Total Calls" value={Math.round(callsMade)} color="text-blue-500" />
              <StatRow icon={CheckCircle} label="Connected" value={connected} color="text-green-500" subtext={`${((connected / Math.max(callsMade, 1)) * 100).toFixed(1)}% pickup`} />
              <StatRow icon={Voicemail} label="Voicemails" value={voicemails} color="text-yellow-500" />
              <StatRow icon={PhoneOff} label="No Answer" value={noAnswer} color="text-muted-foreground" />
            </div>
          </Card>

          {/* Disposition Buckets - The Star of the Show */}
          <Card className="p-4 lg:col-span-5">
            <h3 className="font-semibold flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-primary" />
              Disposition Breakdown
              <span className="ml-auto text-xs text-muted-foreground font-normal">Real-time outcomes</span>
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {/* Positive outcomes - highlighted */}
              <DispositionBox icon={Calendar} label="Appointments" value={dispositions.appointment} color="bg-primary/20 text-primary ring-1 ring-primary/30" />
              <DispositionBox icon={Flame} label="Hot Leads" value={dispositions.hotLead} color="bg-orange-500/20 text-orange-600" />
              <DispositionBox icon={Users} label="Prospects" value={dispositions.potentialProspect} color="bg-blue-500/20 text-blue-600" />
              <DispositionBox icon={Clock} label="Follow Ups" value={dispositions.followUp} color="bg-yellow-500/20 text-yellow-600" />
              <DispositionBox icon={Send} label="Send Info" value={dispositions.sendInfo} color="bg-cyan-500/20 text-cyan-600" />
              <DispositionBox icon={MessageSquare} label="Want Human" value={dispositions.wantHuman} color="bg-purple-500/20 text-purple-600" />
              
              {/* Neutral/negative - muted */}
              <DispositionBox icon={PhoneMissed} label="Call Dropped" value={dispositions.callDropped} color="bg-muted/50 text-muted-foreground" />
              <DispositionBox icon={ThumbsDown} label="Not Interested" value={dispositions.notInterested} color="bg-muted/50 text-muted-foreground" />
              <DispositionBox icon={Ban} label="DNC" value={dispositions.dnc} color="bg-red-500/10 text-red-500" />
              <DispositionBox icon={HelpCircle} label="Wrong Number" value={dispositions.wrongNumber} color="bg-muted/50 text-muted-foreground" />
            </div>
            
            {/* Positive outcomes summary */}
            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total Positive Outcomes</span>
              <span className="text-xl font-bold text-green-500">{positiveOutcomes}</span>
            </div>
          </Card>

          {/* Right Panel - Cost & Pipeline */}
          <div className="lg:col-span-4 space-y-4">
            {/* Cost Tracker */}
            <Card className="p-4">
              <h3 className="font-semibold flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-primary" />
                Cost Tracker
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                  <span className="text-sm">Total Spent</span>
                  <span className="text-xl font-bold">${totalCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                  <span className="text-sm">Cost per Appt</span>
                  <span className={`text-lg font-bold ${costPerAppointment <= config.costPerAppointmentTarget ? 'text-green-500' : 'text-yellow-500'}`}>
                    ${costPerAppointment.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                  <span className="text-sm">Cost per Positive</span>
                  <span className="text-lg font-medium">
                    ${positiveOutcomes > 0 ? (totalCost / positiveOutcomes).toFixed(2) : '0.00'}
                  </span>
                </div>
              </div>
            </Card>

            {/* Live Pipeline Feed */}
            <Card className="p-4">
              <h3 className="font-semibold flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-primary" />
                Live Feed
              </h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {pipelineLeads.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Waiting for calls...
                  </p>
                ) : (
                  pipelineLeads.slice(0, 12).map((lead, i) => (
                    <div 
                      key={i} 
                      className={`flex items-center gap-2 p-1.5 rounded text-xs animate-in slide-in-from-left-2 ${
                        lead.icon === 'appointment' ? 'bg-primary/20' : 
                        lead.icon === 'hot' ? 'bg-orange-500/10' :
                        'bg-muted/30'
                      }`}
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      {getIconForStage(lead.icon)}
                      <span className="font-medium truncate">{lead.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto truncate">
                        {lead.stage}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Complete Button */}
        {isComplete && (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 text-green-500">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Campaign Complete!</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {positiveOutcomes} positive outcomes from {config.leadCount.toLocaleString()} leads
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

const StatRow = ({ 
  icon: Icon, 
  label, 
  value, 
  color,
  subtext,
}: { 
  icon: any; 
  label: string; 
  value: number;
  color: string;
  subtext?: string;
}) => (
  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="text-sm">{label}</span>
    </div>
    <div className="text-right">
      <span className="font-bold">{value.toLocaleString()}</span>
      {subtext && <span className="text-xs text-muted-foreground ml-1">{subtext}</span>}
    </div>
  </div>
);

const DispositionBox = ({ 
  icon: Icon, 
  label, 
  value, 
  color,
}: { 
  icon: any; 
  label: string; 
  value: number;
  color: string;
}) => (
  <div className={`p-2 rounded-lg ${color} transition-all`}>
    <div className="flex items-center gap-1.5 mb-0.5">
      <Icon className="h-3 w-3" />
      <span className="text-xs font-medium truncate">{label}</span>
    </div>
    <div className="text-xl font-bold">
      {value.toLocaleString()}
    </div>
  </div>
);
