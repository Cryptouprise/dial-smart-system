import { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Phone, Users, DollarSign, Clock, TrendingUp, CheckCircle, Voicemail, PhoneOff, Calendar,
  UserX, MessageSquare, ThumbsDown, Ban, Flame, Send, HelpCircle, PhoneMissed
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { DemoPhoneMockup } from './DemoPhoneMockup';
import { DemoSmsRepliesPanel, SmsReply } from './DemoSmsRepliesPanel';
import { DemoEmailMockup } from './DemoEmailMockup';
import { DemoSecondaryCampaignCallout } from './DemoSecondaryCampaignCallout';
import { DemoCampaignSummary } from './DemoCampaignSummary';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { supabase } from '@/integrations/supabase/client';

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
  prospectName?: string;
  prospectCompany?: string;
  prospectEmail?: string;
  onComplete: (results: SimulationResults) => void;
}

// SMS reply templates for different dispositions
const smsReplyTemplates: Record<string, string[]> = {
  appointment: [
    "Perfect, see you then!",
    "Confirmed! Looking forward to it.",
    "Great, I'll be ready!",
    "Sounds good, thanks for setting this up!",
  ],
  hotLead: [
    "Yes I'm interested!",
    "When can we talk?",
    "This sounds exactly like what we need",
    "Send me more details please",
  ],
  followUp: [
    "Call me back tomorrow",
    "Let's reconnect next week",
    "Not a good time, try me Friday",
    "I'll be available after 2pm",
  ],
  sendInfo: [
    "Send me the details",
    "Email me the info please",
    "Can you text me a link?",
    "What's your website?",
  ],
  potentialProspect: [
    "Interesting, tell me more",
    "How does this work exactly?",
    "What's the pricing like?",
    "I might be interested",
  ],
};

export const DemoSimulationDashboard = ({
  config,
  campaignType,
  scrapedData,
  prospectName,
  prospectCompany,
  prospectEmail,
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
  const [conversationHistory, setConversationHistory] = useState<{ sender: 'ai' | 'user'; text: string }[]>([]);
  
  // SMS Replies state
  const [smsReplies, setSmsReplies] = useState<SmsReply[]>([]);
  
  // Email notification state
  const [emailCount, setEmailCount] = useState(0);
  
  // SMS Sent tracking (outbound)
  const [smsSent, setSmsSent] = useState(0);
  
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

  // AI SMS reply handler
  const handleSendMessage = useCallback(async (message: string): Promise<string> => {
    try {
      const { data, error } = await supabase.functions.invoke('demo-sms-reply', {
        body: {
          message,
          campaignType,
          businessName: scrapedData?.business_name || 'Call Boss',
          prospectName: prospectName || undefined,
          prospectCompany: prospectCompany || undefined,
          conversationHistory,
        },
      });

      if (error) throw error;
      
      // Update conversation history
      setConversationHistory(prev => [
        ...prev,
        { sender: 'user', text: message },
        { sender: 'ai', text: data.reply },
      ]);
      
      return data.reply;
    } catch (err) {
      console.error('SMS reply error:', err);
      return "Got it! Let me look into that for you. Want me to have someone reach out?";
    }
  }, [campaignType, scrapedData?.business_name, conversationHistory, prospectName, prospectCompany]);

  const fakeNames = [
    'John S.', 'Sarah M.', 'Mike D.', 'Emily R.', 'Chris T.',
    'Amanda L.', 'David K.', 'Jessica H.', 'Robert P.', 'Lisa N.',
    'James W.', 'Michelle B.', 'Kevin C.', 'Ashley G.', 'Brian F.',
    'Nicole V.', 'Andrew Z.', 'Rachel Q.', 'Tyler O.', 'Megan I.',
  ];

  // Function to generate SMS reply
  const generateSmsReply = useCallback((disposition: string, leadName: string) => {
    const templates = smsReplyTemplates[disposition];
    if (!templates) return;
    
    // 30% chance to generate SMS reply for positive dispositions
    if (Math.random() < 0.30) {
      const message = templates[Math.floor(Math.random() * templates.length)];
      setSmsReplies(prev => [
        {
          id: `sms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          from: leadName,
          message,
          timestamp: new Date(),
          disposition,
        },
        ...prev.slice(0, 49), // Keep max 50 replies
      ]);
    }
  }, []);

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
        const callsThisTick = Math.round(callsPerUpdate);
        
        // REALISTIC SIMULATION - process each call in this batch
        for (let i = 0; i < callsThisTick; i++) {
          const rand = Math.random();
          const leadName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
          
          // 10% pickup rate
          if (rand < 0.10) {
            setConnected(c => c + 1);
            
            // 60% of pickups are "call dropped" (< 30 sec, hung up)
            if (Math.random() < 0.60) {
              setDispositions(d => ({ ...d, callDropped: d.callDropped + 1 }));
              setPipelineLeads(leads => [
                { stage: 'dropped', name: leadName, icon: 'dropped' },
                ...leads.slice(0, 24),
              ]);
            } else {
              // 40% of pickups are real conversations - distribute across dispositions
              const dispRand = Math.random();
              let disposition: keyof DispositionCounts;
              let stage: string;
              let icon: string;
              
              if (dispRand < 0.08) {
                disposition = 'appointment';
                stage = '🎉 APPOINTMENT';
                icon = 'appointment';
                // Increment email count for appointments
                setEmailCount(c => c + 1);
                // Appointments trigger 2 SMS (confirmation + reminder)
                setSmsSent(s => s + 2);
              } else if (dispRand < 0.18) {
                disposition = 'hotLead';
                stage = '🔥 Hot Lead';
                icon = 'hot';
              } else if (dispRand < 0.30) {
                disposition = 'potentialProspect';
                stage = 'Potential Prospect';
                icon = 'prospect';
              } else if (dispRand < 0.42) {
                disposition = 'followUp';
                stage = 'Follow Up';
                icon = 'followup';
              } else if (dispRand < 0.52) {
                disposition = 'sendInfo';
                stage = 'Send Info';
                icon = 'info';
              } else if (dispRand < 0.60) {
                disposition = 'wantHuman';
                stage = 'Transfer Requested';
                icon = 'human';
              } else if (dispRand < 0.75) {
                disposition = 'notInterested';
                stage = 'Not Interested';
                icon = 'no';
              } else if (dispRand < 0.85) {
                disposition = 'dnc';
                stage = 'DNC';
                icon = 'dnc';
              } else {
                disposition = 'wrongNumber';
                stage = 'Wrong Number';
                icon = 'wrong';
              }
              
              setDispositions(d => ({ ...d, [disposition]: d[disposition] + 1 }));
              setPipelineLeads(leads => [
                { stage, name: leadName, icon },
                ...leads.slice(0, 24),
              ]);
              
              // Generate SMS reply for positive dispositions
              if (['appointment', 'hotLead', 'followUp', 'sendInfo', 'potentialProspect'].includes(disposition)) {
                generateSmsReply(disposition, leadName);
                // Track outbound SMS (1 for follow-up message)
                if (disposition !== 'appointment') {
                  setSmsSent(s => s + 1);
                }
              }
            }
          } else if (rand < 0.45) {
            // 35% voicemail (0.10 to 0.45)
            setVoicemails(v => v + 1);
          } else {
            // 55% no answer (0.45 to 1.0)
            setNoAnswer(n => n + 1);
          }
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
  }, [config.leadCount, generateSmsReply]);

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
  const estimatedAdditionalAppointments = Math.round(positiveOutcomes * 0.20); // ~20% of positive outcomes become appointments from secondary campaign

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
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
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

        {/* Main Layout: Dashboard + Phone */}
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          {/* Left: Dashboard Content */}
          <div className="space-y-6">
            {/* Progress */}
            <Card className="p-4 glass-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Campaign Progress</span>
                <span className="font-mono">
                  <AnimatedCounter value={Math.round(callsMade)} duration={300} /> / {config.leadCount.toLocaleString()}
                </span>
              </div>
              <Progress value={progress} className="h-3" />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>Elapsed: {formatTime(elapsedMinutes)}</span>
                <span>Cost: $<AnimatedCounter value={Math.round(totalCost * 100) / 100} duration={300} decimals={2} /></span>
              </div>
            </Card>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Call Stats */}
              <Card className="p-4 glass-card">
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Phone className="h-4 w-4 text-primary" />
                  Call Stats
                </h3>
                <div className="space-y-2">
                  <StatRow icon={Phone} label="Total Calls" value={Math.round(callsMade)} color="text-primary" />
                  <StatRow icon={CheckCircle} label="Connected" value={connected} color="text-green-500" subtext={`${((connected / Math.max(callsMade, 1)) * 100).toFixed(1)}% pickup`} />
                  <StatRow icon={Voicemail} label="Voicemails" value={voicemails} color="text-amber-500" />
                  <StatRow icon={PhoneOff} label="No Answer" value={noAnswer} color="text-muted-foreground" />
                </div>
              </Card>

              {/* Cost Tracker */}
              <Card className="p-4 glass-card">
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-primary" />
                  Cost Tracker
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                    <span className="text-sm">Total Spent</span>
                    <span className="text-xl font-bold">$<AnimatedCounter value={Math.round(totalCost * 100) / 100} duration={400} decimals={2} /></span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                    <span className="text-sm">Cost per Appt</span>
                    <span className={`text-lg font-bold ${costPerAppointment <= config.costPerAppointmentTarget ? 'text-green-500' : 'text-amber-500'}`}>
                      $<AnimatedCounter value={Math.round(costPerAppointment * 100) / 100} duration={400} decimals={2} />
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                    <span className="text-sm">Cost per Positive</span>
                    <span className="text-lg font-medium">
                      $<AnimatedCounter value={positiveOutcomes > 0 ? Math.round((totalCost / positiveOutcomes) * 100) / 100 : 0} duration={400} decimals={2} />
                    </span>
                  </div>
                </div>
              </Card>

              {/* Live Feed */}
              <Card className="p-4 glass-card">
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-primary" />
                  Live Feed
                </h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {pipelineLeads.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Waiting for calls...
                    </p>
                  ) : (
                    pipelineLeads.slice(0, 8).map((lead, i) => (
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

            {/* Disposition Breakdown - Full Width */}
            <Card className="p-4 glass-card">
              <h3 className="font-semibold flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-primary" />
                Disposition Breakdown
                <span className="ml-auto text-xs text-muted-foreground font-normal">Real-time outcomes</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {/* Positive outcomes - highlighted */}
                <DispositionBox icon={Calendar} label="Appointments" value={dispositions.appointment} color="bg-primary/20 text-primary glow-border" />
                <DispositionBox icon={Flame} label="Hot Leads" value={dispositions.hotLead} color="bg-orange-500/20 text-orange-600" />
                <DispositionBox icon={Users} label="Prospects" value={dispositions.potentialProspect} color="bg-blue-500/20 text-blue-600" />
                <DispositionBox icon={Clock} label="Follow Ups" value={dispositions.followUp} color="bg-amber-500/20 text-amber-600" />
                <DispositionBox icon={Send} label="Send Info" value={dispositions.sendInfo} color="bg-cyan-500/20 text-cyan-600" />
                <DispositionBox icon={MessageSquare} label="Want Human" value={dispositions.wantHuman} color="bg-purple-500/20 text-purple-600" />
                
                {/* Neutral/negative - muted */}
                <DispositionBox icon={PhoneMissed} label="Call Dropped" value={dispositions.callDropped} color="bg-muted/50 text-muted-foreground" />
                <DispositionBox icon={ThumbsDown} label="Not Interested" value={dispositions.notInterested} color="bg-muted/50 text-muted-foreground" />
                <DispositionBox icon={Ban} label="DNC" value={dispositions.dnc} color="bg-destructive/10 text-destructive" />
                <DispositionBox icon={HelpCircle} label="Wrong Number" value={dispositions.wrongNumber} color="bg-muted/50 text-muted-foreground" />
              </div>
              
              {/* Positive outcomes summary */}
              <div className="mt-4 pt-3 border-t flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Total Positive Outcomes</span>
                <span className="text-2xl font-bold text-green-500">
                  <AnimatedCounter value={positiveOutcomes} duration={500} />
                </span>
              </div>
            </Card>

            {/* Secondary Campaign Callout */}
            <DemoSecondaryCampaignCallout 
              positiveOutcomes={positiveOutcomes}
              estimatedAdditionalAppointments={estimatedAdditionalAppointments}
            />

            {/* SMS Replies + Email Mockup Row */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* SMS Replies Panel */}
              <DemoSmsRepliesPanel replies={smsReplies} />
              
              {/* Email Mockup */}
              <DemoEmailMockup
                hasEmail={emailCount > 0}
                emailCount={emailCount}
                prospectName={prospectName}
                prospectCompany={prospectCompany}
                prospectEmail={prospectEmail}
                businessName={scrapedData?.business_name}
                campaignType={campaignType}
              />
            </div>

            {/* Complete Button */}
            {isComplete && (
              <DemoCampaignSummary
                callsMade={Math.round(callsMade)}
                voicemails={voicemails}
                smsSent={smsSent}
                emailsSent={emailCount}
                totalCost={totalCost}
                positiveOutcomes={positiveOutcomes}
                onContinue={handleComplete}
              />
            )}
          </div>

          {/* Right: Docked Phone Panel */}
          <div className="xl:sticky xl:top-4 xl:self-start">
            <div className="space-y-3">
              <div className="text-center">
                <h3 className="font-semibold text-sm">Live SMS Conversation</h3>
                <p className="text-xs text-muted-foreground">Try replying to Lady Jarvis!</p>
              </div>
              <DemoPhoneMockup
                campaignType={campaignType}
                businessName={scrapedData?.business_name}
                prospectName={prospectName}
                onSendMessage={handleSendMessage}
              />
              <p className="text-xs text-center text-muted-foreground">
                💡 This is exactly how your leads would interact
              </p>
            </div>
          </div>
        </div>
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
      <span className="font-bold"><AnimatedCounter value={value} duration={400} /></span>
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
  <div className={`p-2 rounded-lg ${color} transition-all hover:scale-105`}>
    <div className="flex items-center gap-1.5 mb-0.5">
      <Icon className="h-3 w-3" />
      <span className="text-xs font-medium truncate">{label}</span>
    </div>
    <div className="text-xl font-bold">
      <AnimatedCounter value={value} duration={400} />
    </div>
  </div>
);
