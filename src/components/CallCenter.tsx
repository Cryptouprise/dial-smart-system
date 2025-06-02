
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Phone, PhoneOff, Play, Pause, SkipForward } from 'lucide-react';
import { usePredictiveDialing } from '@/hooks/usePredictiveDialing';

interface CallCenterProps {
  onStatsUpdate?: (stats: any) => void;
}

const CallCenter = ({ onStatsUpdate }: CallCenterProps) => {
  const { getCampaigns, getLeads, makeCall, updateCallOutcome, isLoading } = usePredictiveDialing();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [leads, setLeads] = useState<any[]>([]);
  const [currentLead, setCurrentLead] = useState<any>(null);
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [isDialing, setIsDialing] = useState(false);
  const [callOutcome, setCallOutcome] = useState('');
  const [callNotes, setCallNotes] = useState('');

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      loadCampaignLeads();
    }
  }, [selectedCampaign]);

  const loadCampaigns = async () => {
    const data = await getCampaigns();
    if (data) {
      const activeCampaigns = data.filter(c => c.status === 'active');
      setCampaigns(activeCampaigns);
    }
  };

  const loadCampaignLeads = async () => {
    const data = await getLeads({ 
      campaign_id: selectedCampaign,
      status: 'new' // Only get leads that haven't been contacted
    });
    if (data) {
      setLeads(data);
      setCurrentLead(data[0] || null);
    }
  };

  const handleStartCall = async () => {
    if (!currentLead || !selectedCampaign) return;

    setIsDialing(true);
    
    // Use first available caller ID (you might want to implement number rotation here)
    const callerId = '+15551234567'; // This should come from your phone numbers
    
    const result = await makeCall(
      selectedCampaign,
      currentLead.id,
      currentLead.phone_number,
      callerId
    );

    if (result) {
      setCurrentCall(result);
    }
    
    setIsDialing(false);
  };

  const handleEndCall = () => {
    setCurrentCall(null);
    setCallOutcome('');
    setCallNotes('');
  };

  const handleCallOutcome = async () => {
    if (!currentCall || !callOutcome) return;

    await updateCallOutcome(currentCall.call_log_id, callOutcome, callNotes);
    
    // Move to next lead
    const currentIndex = leads.findIndex(l => l.id === currentLead?.id);
    const nextLead = leads[currentIndex + 1] || null;
    setCurrentLead(nextLead);
    
    handleEndCall();
    
    // Update stats
    onStatsUpdate?.({
      todayCalls: (prev: any) => prev.todayCalls + 1
    });
  };

  const handleSkipLead = () => {
    const currentIndex = leads.findIndex(l => l.id === currentLead?.id);
    const nextLead = leads[currentIndex + 1] || null;
    setCurrentLead(nextLead);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Call Center
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          Manage active dialing sessions and call outcomes
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaign Selection */}
        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Select Campaign</CardTitle>
            <CardDescription>Choose an active campaign to start dialing</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
              <SelectTrigger>
                <SelectValue placeholder="Select a campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedCampaign && (
              <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                <p>Leads remaining: {leads.length}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Lead */}
        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Current Lead</CardTitle>
            <CardDescription>Lead information and calling status</CardDescription>
          </CardHeader>
          <CardContent>
            {currentLead ? (
              <div className="space-y-3">
                <div>
                  <h3 className="font-medium">
                    {currentLead.first_name} {currentLead.last_name}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {currentLead.company}
                  </p>
                </div>
                
                <div>
                  <span className="text-sm font-medium">Phone:</span>
                  <span className="ml-2 font-mono">{currentLead.phone_number}</span>
                </div>
                
                {currentLead.email && (
                  <div>
                    <span className="text-sm font-medium">Email:</span>
                    <span className="ml-2">{currentLead.email}</span>
                  </div>
                )}
                
                <div className="flex gap-2 pt-2">
                  {!currentCall ? (
                    <>
                      <Button 
                        onClick={handleStartCall} 
                        disabled={isDialing || isLoading}
                        className="flex-1"
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        {isDialing ? 'Dialing...' : 'Start Call'}
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={handleSkipLead}
                        disabled={isLoading}
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button 
                      variant="destructive" 
                      onClick={handleEndCall}
                      className="flex-1"
                    >
                      <PhoneOff className="h-4 w-4 mr-2" />
                      End Call
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">
                {selectedCampaign ? 'No leads available' : 'Select a campaign to view leads'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Call Outcome */}
      {currentCall && (
        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Call Outcome</CardTitle>
            <CardDescription>Record the result of this call</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Outcome
              </label>
              <Select value={callOutcome} onValueChange={setCallOutcome}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                  <SelectItem value="callback">Callback</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="do_not_call">Do Not Call</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Notes
              </label>
              <Textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="Add call notes..."
                rows={3}
              />
            </div>

            <Button 
              onClick={handleCallOutcome}
              disabled={!callOutcome || isLoading}
            >
              Save & Next Lead
            </Button>
          </CardContent>
        </Card>
      )}

      {/* No Active Campaigns */}
      {campaigns.length === 0 && (
        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
          <CardContent className="text-center py-8">
            <p className="text-slate-500 dark:text-slate-400">
              No active campaigns found. Create and activate a campaign to start dialing.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CallCenter;
