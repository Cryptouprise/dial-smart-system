import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Phone, PhoneCall, PhoneOff, CheckCircle, XCircle, Clock, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SimulatedContact {
  id: string;
  name: string;
  phone: string;
  status: 'pending' | 'dialing' | 'connected' | 'completed' | 'no_answer' | 'voicemail';
  duration?: number;
  outcome?: string;
}

const MOCK_CONTACTS: SimulatedContact[] = [
  { id: '1', name: 'John Smith', phone: '+1 (555) 123-4567', status: 'pending' },
  { id: '2', name: 'Sarah Johnson', phone: '+1 (555) 234-5678', status: 'pending' },
  { id: '3', name: 'Mike Williams', phone: '+1 (555) 345-6789', status: 'pending' },
  { id: '4', name: 'Emily Davis', phone: '+1 (555) 456-7890', status: 'pending' },
  { id: '5', name: 'Your Number', phone: '+1 (214) 529-1531', status: 'pending' },
];

const OUTCOMES = ['Interested', 'Callback Scheduled', 'Not Interested', 'Voicemail Left', 'No Answer'];

export const CallSimulator = () => {
  const [contacts, setContacts] = useState<SimulatedContact[]>(MOCK_CONTACTS);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { toast } = useToast();

  const getStatusIcon = (status: SimulatedContact['status']) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'dialing': return <Phone className="h-4 w-4 text-yellow-500 animate-pulse" />;
      case 'connected': return <PhoneCall className="h-4 w-4 text-green-500 animate-pulse" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'no_answer': return <PhoneOff className="h-4 w-4 text-red-500" />;
      case 'voicemail': return <XCircle className="h-4 w-4 text-orange-500" />;
    }
  };

  const getStatusBadge = (status: SimulatedContact['status']) => {
    const variants: Record<string, string> = {
      pending: 'bg-muted text-muted-foreground',
      dialing: 'bg-yellow-500/20 text-yellow-500',
      connected: 'bg-green-500/20 text-green-500',
      completed: 'bg-green-500/20 text-green-500',
      no_answer: 'bg-red-500/20 text-red-500',
      voicemail: 'bg-orange-500/20 text-orange-500',
    };
    return <Badge className={variants[status]}>{status.replace('_', ' ')}</Badge>;
  };

  const simulateCall = async (index: number) => {
    // Update to dialing
    setContacts(prev => prev.map((c, i) => 
      i === index ? { ...c, status: 'dialing' as const } : c
    ));
    
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
    
    // Randomly decide outcome
    const rand = Math.random();
    let finalStatus: SimulatedContact['status'];
    let outcome: string;
    let duration: number;
    
    if (rand < 0.6) {
      // Connected
      setContacts(prev => prev.map((c, i) => 
        i === index ? { ...c, status: 'connected' as const } : c
      ));
      
      duration = 15 + Math.floor(Math.random() * 120);
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
      
      finalStatus = 'completed';
      outcome = OUTCOMES[Math.floor(Math.random() * 3)];
    } else if (rand < 0.8) {
      finalStatus = 'no_answer';
      outcome = 'No Answer';
      duration = 0;
    } else {
      finalStatus = 'voicemail';
      outcome = 'Voicemail Left';
      duration = 30;
    }
    
    setContacts(prev => prev.map((c, i) => 
      i === index ? { ...c, status: finalStatus, outcome, duration } : c
    ));
  };

  const runSimulation = async () => {
    setIsRunning(true);
    setContacts(MOCK_CONTACTS);
    setCurrentIndex(0);
    
    toast({
      title: "Simulation Started",
      description: "Running simulated calls to 5 contacts...",
    });

    for (let i = 0; i < MOCK_CONTACTS.length; i++) {
      setCurrentIndex(i);
      await simulateCall(i);
    }
    
    setIsRunning(false);
    toast({
      title: "Simulation Complete",
      description: "All 5 simulated calls finished",
    });
  };

  const completedCount = contacts.filter(c => 
    ['completed', 'no_answer', 'voicemail'].includes(c.status)
  ).length;
  
  const connectedCount = contacts.filter(c => c.status === 'completed').length;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Call Simulation (Mock Test)
          </CardTitle>
          <Button 
            onClick={runSimulation} 
            disabled={isRunning}
            className="gap-2"
          >
            {isRunning ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Phone className="h-4 w-4" />
                Start Simulation
              </>
            )}
          </Button>
        </div>
        {isRunning && (
          <Progress value={(completedCount / contacts.length) * 100} className="mt-2" />
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {contacts.map((contact, index) => (
            <div 
              key={contact.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                index === currentIndex && isRunning 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border'
              }`}
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(contact.status)}
                <div>
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{contact.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{contact.phone}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {contact.duration !== undefined && contact.duration > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {Math.floor(contact.duration / 60)}:{(contact.duration % 60).toString().padStart(2, '0')}
                  </span>
                )}
                {contact.outcome && (
                  <Badge variant="outline" className="text-xs">
                    {contact.outcome}
                  </Badge>
                )}
                {getStatusBadge(contact.status)}
              </div>
            </div>
          ))}
        </div>
        
        {completedCount === contacts.length && (
          <div className="mt-4 p-4 rounded-lg bg-muted/50">
            <h4 className="font-semibold mb-2">Simulation Results</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">{contacts.length}</div>
                <div className="text-sm text-muted-foreground">Total Calls</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-500">{connectedCount}</div>
                <div className="text-sm text-muted-foreground">Connected</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {Math.round((connectedCount / contacts.length) * 100)}%
                </div>
                <div className="text-sm text-muted-foreground">Connect Rate</div>
              </div>
            </div>
          </div>
        )}
        
        <p className="text-xs text-muted-foreground mt-4 text-center">
          This is a mock simulation - no real calls are made
        </p>
      </CardContent>
    </Card>
  );
};
