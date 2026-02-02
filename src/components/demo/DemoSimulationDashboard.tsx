import { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Phone, Users, DollarSign, Clock, TrendingUp, CheckCircle, Voicemail, PhoneOff, Calendar,
  UserX, MessageSquare, ThumbsDown, Ban, Flame, Send, HelpCircle, PhoneMissed, PhoneIncoming
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
  
  // Callback tracking (leads who call back after voicemail/no answer)
  const [callbacks, setCallbacks] = useState(0);
  const [callbackAppointments, setCallbackAppointments] = useState(0);
  
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
            
            // 15% of voicemails result in callbacks
            if (Math.random() < 0.15) {
              setTimeout(() => {
                setCallbacks(c => c + 1);
                setPipelineLeads(leads => [
                  { stage: '📞 CALLBACK', name: leadName, icon: 'callback' },
                  ...leads.slice(0, 24),
                ]);
                // ~2.6% of callbacks convert to appointments (4 out of 155)
                if (Math.random() < 0.026) {
                  setCallbackAppointments(a => a + 1);
                  setDispositions(d => ({ ...d, appointment: d.appointment + 1 }));
                  setEmailCount(c => c + 1);
                  setSmsSent(s => s + 2);
                  generateSmsReply('appointment', leadName);
                  setPipelineLeads(leads => [
                    { stage: '🎉 APPOINTMENT (callback)', name: leadName, icon: 'appointment' },
                    ...leads.slice(0, 24),
                  ]);
                }
              }, Math.random() * 3000 + 500); // Staggered callback timing
            }
          } else {
            // 55% no answer (0.45 to 1.0)
            setNoAnswer(n => n + 1);
            
            // 5% of no-answers call back (lower rate than voicemails)
            if (Math.random() < 0.05) {
              setTimeout(() => {
                setCallbacks(c => c + 1);
                setPipelineLeads(leads => [
                  { stage: '📞 CALLBACK', name: leadName, icon: 'callback' },
                  ...leads.slice(0, 24),
                ]);
                // ~2.6% of callbacks convert to appointments (4 out of 155)
                if (Math.random() < 0.026) {
                  setCallbackAppointments(a => a + 1);
                  setDispositions(d => ({ ...d, appointment: d.appointment + 1 }));
                  setEmailCount(c => c + 1);
                  setSmsSent(s => s + 2);
                  generateSmsReply('appointment', leadName);
                  setPipelineLeads(leads => [
                    { stage: '🎉 APPOINTMENT (callback)', name: leadName, icon: 'appointment' },
                    ...leads.slice(0, 24),
                  ]);
                }
              }, Math.random() * 4000 + 1000); // Staggered callback timing
            }
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
      case 'callback': return <PhoneIncoming className="h-3 w-3 text-cyan-500" />;
      default: return <CheckCircle className="h-3 w-3" />;
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-background">
      <div className="max-w-[1600px] mx-auto">
        {/* Premium Header */}
        <div className="relative mb-8">
          <div className="absolute -inset-4 bg-gradient-to-r from-violet-500/10 via-primary/5 to-cyan-500/10 rounded-3xl blur-2xl" />
          
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 border border-primary/30">
                  <Phone className="h-5 w-5 text-primary" />
                </div>
                Campaign Simulation
              </h1>
              <p className="text-muted-foreground mt-1">
                <span className="bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent font-semibold">
                  {scrapedData?.business_name}
                </span>
                {' '}- {campaignType.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
        </div>

        {/* Main Layout: Dashboard + Phone */}
        <div className="space-y-6">
          {/* Left: Dashboard Content */}
          <div className="space-y-6">
            {/* Progress - Premium Card with MASSIVE Time-lapse Indicator */}
            <div className="relative">
              <div className="absolute -inset-[1px] bg-gradient-to-r from-primary/50 via-violet-500/50 to-cyan-500/50 rounded-2xl blur-sm opacity-50" />
              <div className="relative p-5 rounded-2xl bg-background/80 backdrop-blur-sm border-2 border-primary/30">
                {/* HUGE Time-lapse Banner at top of progress card */}
                <div className="relative mb-4 -mx-5 -mt-5 overflow-hidden rounded-t-2xl">
                  {/* Animated background */}
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 animate-pulse" />
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_3s_linear_infinite]" />
                  
                  <div className="relative flex items-center justify-center gap-4 px-6 py-4 text-white">
                    {/* Pulsing recording dot */}
                    <div className="relative">
                      <div className="absolute inset-0 w-4 h-4 rounded-full bg-white animate-ping" />
                      <div className="relative w-4 h-4 rounded-full bg-white shadow-lg" />
                    </div>
                    
                    {/* Speed indicator icon */}
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-4 bg-white/80 rounded-full" />
                      <div className="w-1.5 h-6 bg-white rounded-full" />
                      <div className="w-1.5 h-8 bg-white rounded-full" />
                      <div className="w-1.5 h-6 bg-white rounded-full" />
                      <div className="w-1.5 h-4 bg-white/80 rounded-full" />
                    </div>
                    
                    <div className="text-center">
                      <span className="font-black text-xl md:text-2xl tracking-tight drop-shadow-lg">
                        ⚡ SIMULATING FULL DAY ⚡
                      </span>
                      <p className="text-xs md:text-sm font-medium text-white/90 mt-0.5">
                        Watch a complete workday unfold in real-time
                      </p>
                    </div>
                    
                    {/* Speed indicator icon (mirrored) */}
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-4 bg-white/80 rounded-full" />
                      <div className="w-1.5 h-6 bg-white rounded-full" />
                      <div className="w-1.5 h-8 bg-white rounded-full" />
                      <div className="w-1.5 h-6 bg-white rounded-full" />
                      <div className="w-1.5 h-4 bg-white/80 rounded-full" />
                    </div>
                    
                    <Clock className="h-6 w-6 animate-spin" style={{ animationDuration: '3s' }} />
                  </div>
                </div>
                
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-muted-foreground">Campaign Progress</span>
                  <span className="font-mono text-lg font-bold bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent">
                    <AnimatedCounter value={Math.round(callsMade)} duration={300} /> / {config.leadCount.toLocaleString()}
                  </span>
                </div>
                <Progress value={progress} className="h-3" />
                <div className="flex justify-between mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Elapsed: <span className="font-medium text-foreground">{formatTime(elapsedMinutes)}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" />
                    Cost: <span className="font-medium text-primary">$<AnimatedCounter value={Math.round(totalCost * 100) / 100} duration={300} decimals={2} /></span>
                  </span>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Call Stats - Premium */}
              <div className="relative group">
                <div className="absolute -inset-[1px] bg-gradient-to-r from-emerald-500/50 to-green-500/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
                <div className="relative p-5 rounded-2xl bg-background/80 backdrop-blur-sm border-2 border-emerald-500/30 hover:border-emerald-500/50 transition-all">
                  <h3 className="font-semibold flex items-center gap-2 mb-4">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/20">
                      <Phone className="h-4 w-4 text-emerald-500" />
                    </div>
                    Call Stats
                  </h3>
                  <div className="space-y-2">
                    <StatRow icon={Phone} label="Total Calls" value={Math.round(callsMade)} color="text-primary" />
                    <StatRow icon={CheckCircle} label="Connected" value={connected} color="text-emerald-500" subtext={`${((connected / Math.max(callsMade, 1)) * 100).toFixed(1)}% pickup`} />
                    <StatRow icon={Voicemail} label="Voicemails" value={voicemails} color="text-amber-500" />
                    <StatRow icon={PhoneOff} label="No Answer" value={noAnswer} color="text-muted-foreground" />
                    {callbacks > 0 && (
                      <StatRow 
                        icon={PhoneIncoming} 
                        label="Callbacks" 
                        value={callbacks} 
                        color="text-cyan-500" 
                        subtext={`${callbackAppointments} out of ${callbacks} → appts`}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Cost Tracker - Premium */}
              <div className="relative group">
                <div className="absolute -inset-[1px] bg-gradient-to-r from-amber-500/50 to-yellow-500/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
                <div className="relative p-5 rounded-2xl bg-background/80 backdrop-blur-sm border-2 border-amber-500/30 hover:border-amber-500/50 transition-all">
                  <h3 className="font-semibold flex items-center gap-2 mb-4">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/20">
                      <DollarSign className="h-4 w-4 text-amber-500" />
                    </div>
                    Cost Tracker
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-border/30">
                      <span className="text-sm">Total Spent</span>
                      <span className="text-xl font-bold text-amber-500">$<AnimatedCounter value={Math.round(totalCost * 100) / 100} duration={400} decimals={2} /></span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-border/30">
                      <span className="text-sm">Cost per Appt</span>
                      <span className={`text-lg font-bold ${costPerAppointment <= config.costPerAppointmentTarget ? 'text-emerald-500' : 'text-amber-500'}`}>
                        $<AnimatedCounter value={Math.round(costPerAppointment * 100) / 100} duration={400} decimals={2} />
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-border/30">
                      <span className="text-sm">Cost per Positive</span>
                      <span className="text-lg font-medium">
                        $<AnimatedCounter value={positiveOutcomes > 0 ? Math.round((totalCost / positiveOutcomes) * 100) / 100 : 0} duration={400} decimals={2} />
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Feed - Premium */}
              <div className="relative group">
                <div className="absolute -inset-[1px] bg-gradient-to-r from-violet-500/50 to-purple-500/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
                <div className="relative p-5 rounded-2xl bg-background/80 backdrop-blur-sm border-2 border-violet-500/30 hover:border-violet-500/50 transition-all">
                  <h3 className="font-semibold flex items-center gap-2 mb-4">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/20">
                      <Users className="h-4 w-4 text-violet-500" />
                    </div>
                    Live Feed
                    <div className="ml-auto w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                  </h3>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {pipelineLeads.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Waiting for calls...
                      </p>
                    ) : (
                      pipelineLeads.slice(0, 8).map((lead, i) => (
                        <div 
                          key={i} 
                          className={`flex items-center gap-2 p-2 rounded-lg text-xs animate-in slide-in-from-left-2 border ${
                            lead.icon === 'appointment' ? 'bg-primary/10 border-primary/30' : 
                            lead.icon === 'hot' ? 'bg-orange-500/10 border-orange-500/30' :
                            'bg-muted/20 border-border/30'
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
                </div>
              </div>
            </div>

            {/* Disposition Breakdown - Premium Full Width */}
            <div className="relative">
              <div className="absolute -inset-[1px] bg-gradient-to-r from-primary/30 via-violet-500/30 to-cyan-500/30 rounded-2xl blur-sm opacity-50" />
              <div className="relative p-5 rounded-2xl bg-background/80 backdrop-blur-sm border-2 border-primary/20">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 border border-primary/20">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  Disposition Breakdown
                  <span className="ml-auto text-xs text-muted-foreground font-normal px-2 py-1 rounded-full bg-muted/50">Real-time outcomes</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {/* Positive outcomes - highlighted */}
                  <DispositionBox icon={Calendar} label="Appointments" value={dispositions.appointment} color="bg-gradient-to-br from-primary/20 to-violet-500/20 text-primary border-2 border-primary/40" />
                  <DispositionBox icon={Flame} label="Hot Leads" value={dispositions.hotLead} color="bg-gradient-to-br from-orange-500/20 to-amber-500/20 text-orange-500 border-2 border-orange-500/40" />
                  <DispositionBox icon={Users} label="Prospects" value={dispositions.potentialProspect} color="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-500 border-2 border-blue-500/40" />
                  <DispositionBox icon={Clock} label="Follow Ups" value={dispositions.followUp} color="bg-gradient-to-br from-amber-500/20 to-yellow-500/20 text-amber-500 border-2 border-amber-500/40" />
                  <DispositionBox icon={Send} label="Send Info" value={dispositions.sendInfo} color="bg-gradient-to-br from-cyan-500/20 to-teal-500/20 text-cyan-500 border-2 border-cyan-500/40" />
                  <DispositionBox icon={MessageSquare} label="Want Human" value={dispositions.wantHuman} color="bg-gradient-to-br from-purple-500/20 to-violet-500/20 text-purple-500 border-2 border-purple-500/40" />
                  
                  {/* Neutral/negative - muted */}
                  <DispositionBox icon={PhoneMissed} label="Call Dropped" value={dispositions.callDropped} color="bg-muted/30 text-muted-foreground border border-border/30" />
                  <DispositionBox icon={ThumbsDown} label="Not Interested" value={dispositions.notInterested} color="bg-muted/30 text-muted-foreground border border-border/30" />
                  <DispositionBox icon={Ban} label="DNC" value={dispositions.dnc} color="bg-destructive/10 text-destructive border border-destructive/30" />
                  <DispositionBox icon={HelpCircle} label="Wrong Number" value={dispositions.wrongNumber} color="bg-muted/30 text-muted-foreground border border-border/30" />
                </div>
                
                {/* Positive outcomes summary */}
                <div className="mt-5 pt-4 border-t border-border/30 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Total Positive Outcomes</span>
                  <span className="text-3xl font-bold bg-gradient-to-r from-emerald-500 to-green-500 bg-clip-text text-transparent">
                    <AnimatedCounter value={positiveOutcomes} duration={500} />
                  </span>
                </div>
              </div>
            </div>

            {/* Secondary Campaign Callout */}
            <DemoSecondaryCampaignCallout 
              positiveOutcomes={positiveOutcomes}
              estimatedAdditionalAppointments={estimatedAdditionalAppointments}
            />

            {/* SMS Replies Panel - Full Width */}
            <DemoSmsRepliesPanel replies={smsReplies} />
            
            {/* Phone + Laptop Side by Side - LARGE */}
            <div className="relative">
              <div className="absolute -inset-8 bg-gradient-to-r from-violet-500/15 via-primary/15 to-cyan-500/15 rounded-[3rem] blur-3xl" />
              <div className="relative p-8 md:p-12 rounded-3xl bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-xl border border-primary/30 shadow-2xl">
                <h3 className="font-bold text-center mb-8 text-xl md:text-2xl flex items-center justify-center gap-3">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 border border-primary/30">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <span className="bg-gradient-to-r from-primary via-violet-500 to-cyan-500 bg-clip-text text-transparent">
                    Real-Time Lead Communication
                  </span>
                  <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-primary/20 border border-cyan-500/30">
                    <MessageSquare className="h-5 w-5 text-cyan-500" />
                  </div>
                </h3>
                
                <div className="flex flex-col xl:flex-row items-end justify-center gap-10 xl:gap-16">
                  {/* Phone Mockup - Full Size */}
                  <div className="flex-shrink-0">
                    <DemoPhoneMockup
                      campaignType={campaignType}
                      businessName={scrapedData?.business_name}
                      prospectName={prospectName}
                      prospectCompany={prospectCompany}
                      onSendMessage={handleSendMessage}
                    />
                  </div>
                  
                  {/* Laptop Mockup - Full Size */}
                  <div className="flex-shrink-0">
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
                </div>
                
                <p className="text-center text-sm text-muted-foreground mt-8">
                  💡 This is exactly how your leads will interact with Lady Jarvis
                </p>
              </div>
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

export default DemoSimulationDashboard;
