
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Play, Pause, Edit, Trash2 } from 'lucide-react';
import { usePredictiveDialing } from '@/hooks/usePredictiveDialing';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  agent_id?: string;
  calls_per_minute: number;
  max_attempts: number;
  calling_hours_start: string;
  calling_hours_end: string;
  timezone: string;
  created_at: string;
}

interface CampaignManagerProps {
  onRefresh?: () => void;
}

const CampaignManager = ({ onRefresh }: CampaignManagerProps) => {
  const { getCampaigns, createCampaign, updateCampaign, isLoading } = usePredictiveDialing();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    agent_id: '',
    calls_per_minute: 5,
    max_attempts: 3,
    calling_hours_start: '09:00',
    calling_hours_end: '17:00',
    timezone: 'America/New_York'
  });

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    const data = await getCampaigns();
    if (data) setCampaigns(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingCampaign) {
      await updateCampaign(editingCampaign.id, formData);
    } else {
      await createCampaign({ ...formData, status: 'draft' });
    }
    
    setShowCreateDialog(false);
    setEditingCampaign(null);
    resetForm();
    loadCampaigns();
    onRefresh?.();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      agent_id: '',
      calls_per_minute: 5,
      max_attempts: 3,
      calling_hours_start: '09:00',
      calling_hours_end: '17:00',
      timezone: 'America/New_York'
    });
  };

  const handleEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      description: campaign.description || '',
      agent_id: campaign.agent_id || '',
      calls_per_minute: campaign.calls_per_minute,
      max_attempts: campaign.max_attempts,
      calling_hours_start: campaign.calling_hours_start,
      calling_hours_end: campaign.calling_hours_end,
      timezone: campaign.timezone
    });
    setShowCreateDialog(true);
  };

  const handleStatusChange = async (campaign: Campaign, newStatus: string) => {
    await updateCampaign(campaign.id, { status: newStatus });
    loadCampaigns();
    onRefresh?.();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Campaign Manager
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            Create and manage your dialing campaigns
          </p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setEditingCampaign(null); }}>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}
              </DialogTitle>
              <DialogDescription>
                Set up your campaign parameters and calling schedule.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Campaign Name
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter campaign name"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Campaign description (optional)"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Calls/Minute
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={formData.calls_per_minute}
                    onChange={(e) => setFormData({ ...formData, calls_per_minute: parseInt(e.target.value) })}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Max Attempts
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.max_attempts}
                    onChange={(e) => setFormData({ ...formData, max_attempts: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Start Time
                  </label>
                  <Input
                    type="time"
                    value={formData.calling_hours_start}
                    onChange={(e) => setFormData({ ...formData, calling_hours_start: e.target.value })}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    End Time
                  </label>
                  <Input
                    type="time"
                    value={formData.calling_hours_end}
                    onChange={(e) => setFormData({ ...formData, calling_hours_end: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isLoading}>
                  {editingCampaign ? 'Update' : 'Create'} Campaign
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {campaigns.map((campaign) => (
          <Card key={campaign.id} className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {campaign.name}
                    <Badge variant={campaign.status === 'active' ? 'default' : 
                                  campaign.status === 'paused' ? 'secondary' : 'outline'}>
                      {campaign.status}
                    </Badge>
                  </CardTitle>
                  {campaign.description && (
                    <CardDescription>{campaign.description}</CardDescription>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(campaign)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  
                  {campaign.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange(campaign, 'paused')}
                    >
                      <Pause className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange(campaign, 'active')}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Calls/Min:</span>
                  <div className="font-medium">{campaign.calls_per_minute}</div>
                </div>
                <div>
                  <span className="text-slate-500">Max Attempts:</span>
                  <div className="font-medium">{campaign.max_attempts}</div>
                </div>
                <div>
                  <span className="text-slate-500">Hours:</span>
                  <div className="font-medium">
                    {campaign.calling_hours_start} - {campaign.calling_hours_end}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Timezone:</span>
                  <div className="font-medium">{campaign.timezone}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {campaigns.length === 0 && (
          <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardContent className="text-center py-8">
              <p className="text-slate-500 dark:text-slate-400">
                No campaigns created yet. Create your first campaign to get started.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CampaignManager;
