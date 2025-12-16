
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Upload, Edit, Trash2, Phone, User, Building, Mail, RotateCcw, Bot } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { usePredictiveDialing } from '@/hooks/usePredictiveDialing';
import { supabase } from '@/integrations/supabase/client';
import LeadActivityTimeline from './LeadActivityTimeline';
import { LeadDetailDialog } from './LeadDetailDialog';
interface LeadManagerProps {
  onStatsUpdate: (count: number) => void;
}

const LeadManager = ({ onStatsUpdate }: LeadManagerProps) => {
  const { toast } = useToast();
  const { createLead, updateLead, getLeads, importLeads, resetLeadsForCalling, isLoading } = usePredictiveDialing();
  const [leads, setLeads] = useState<any[]>([]);
  const [leadsWithActivity, setLeadsWithActivity] = useState<Set<string>>(new Set());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);
  const [importText, setImportText] = useState('');
  const [filters, setFilters] = useState({ status: 'all', search: '' });
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [detailLead, setDetailLead] = useState<any | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    email: '',
    company: '',
    notes: '',
    status: 'new',
    priority: 1
  });

  useEffect(() => {
    loadLeads();
    loadLeadsWithActivity();
  }, [filters]);

  const loadLeadsWithActivity = async () => {
    // Get leads that have recent agent decisions (last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const { data } = await supabase
      .from('agent_decisions')
      .select('lead_id')
      .gte('created_at', oneDayAgo.toISOString())
      .not('lead_id', 'is', null);
    
    if (data) {
      const leadIds = new Set(data.map(d => d.lead_id).filter(Boolean) as string[]);
      setLeadsWithActivity(leadIds);
    }
  };

  const loadLeads = async () => {
    const leadsData = await getLeads(filters.status && filters.status !== 'all' ? { status: filters.status } : undefined);
    if (leadsData) {
      let filteredLeads = leadsData;

      // Hide archived/DNC leads by default unless explicitly filtering for them
      if (filters.status === 'all') {
        filteredLeads = filteredLeads.filter((lead: any) => !lead.do_not_call && lead.status !== 'do_not_call');
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredLeads = filteredLeads.filter(lead => 
          (lead.first_name?.toLowerCase().includes(searchLower)) ||
          (lead.last_name?.toLowerCase().includes(searchLower)) ||
          (lead.phone_number?.includes(searchLower)) ||
          (lead.company?.toLowerCase().includes(searchLower))
        );
      }
      setLeads(filteredLeads);
      onStatsUpdate(filteredLeads.length);
    }
  };

  const handleCreateLead = async () => {
    const result = await createLead(formData);
    if (result) {
      setIsCreateDialogOpen(false);
      resetForm();
      loadLeads();
    }
  };

  const handleUpdateLead = async () => {
    if (editingLead) {
      const result = await updateLead(editingLead.id, formData);
      if (result) {
        setEditingLead(null);
        resetForm();
        loadLeads();
      }
    }
  };

  const handleImportLeads = async () => {
    try {
      const lines = importText.trim().split('\n');
      const importedLeads = lines.map(line => {
        const [phone_number, first_name = '', last_name = '', email = '', company = ''] = line.split(',').map(s => s.trim());
        return {
          phone_number,
          first_name: first_name || undefined,
          last_name: last_name || undefined,
          email: email || undefined,
          company: company || undefined,
          status: 'new',
          priority: 1
        };
      }).filter(lead => lead.phone_number);

      const result = await importLeads(importedLeads);
      if (result) {
        setIsImportDialogOpen(false);
        setImportText('');
        loadLeads();
      }
    } catch (error) {
      console.error('Import error:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      phone_number: '',
      email: '',
      company: '',
      notes: '',
      status: 'new',
      priority: 1
    });
  };

  const startEdit = (lead: any) => {
    setEditingLead(lead);
    setFormData({ ...lead });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'contacted': return 'bg-yellow-100 text-yellow-800';
      case 'interested': return 'bg-green-100 text-green-800';
      case 'not_interested': return 'bg-red-100 text-red-800';
      case 'callback': return 'bg-purple-100 text-purple-800';
      case 'converted': return 'bg-emerald-100 text-emerald-800';
      case 'do_not_call': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeads(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const handleResetForCalling = async () => {
    if (selectedLeads.length === 0) return;
    const result = await resetLeadsForCalling(selectedLeads);
    if (result) {
      setSelectedLeads([]);
      loadLeads();
    }
  };

  const archiveLead = async (leadId: string) => {
    const { error } = await supabase
      .from('leads')
      .update({
        status: 'do_not_call',
        do_not_call: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (error) throw error;
  };

  const deleteOrArchiveLead = async (lead: any) => {
    try {
      // Try to hard-delete first
      const { error } = await supabase.from('leads').delete().eq('id', lead.id);
      if (error) throw error;

      toast({
        title: 'Lead deleted',
        description: 'The lead was permanently removed.',
      });
    } catch (err: any) {
      // If the lead has call/SMS/AI history, DB constraints/policies may prevent deletes.
      // Fall back to archiving (DNC) so the app stays workable.
      await archiveLead(lead.id);
      toast({
        title: 'Lead removed (archived)',
        description: 'This lead has existing history, so it was archived (Do Not Call) instead of deleted.',
      });
    } finally {
      setLeadToDelete(null);
      loadLeads();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="flex-1">
            <Input
              placeholder="Search leads..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="max-w-sm"
            />
          </div>
          <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="interested">Interested</SelectItem>
              <SelectItem value="not_interested">Not Interested</SelectItem>
              <SelectItem value="callback">Callback</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="do_not_call">Do Not Call</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          {selectedLeads.length > 0 && (
            <Button 
              variant="outline" 
              onClick={handleResetForCalling}
              disabled={isLoading}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset for Calling ({selectedLeads.length})
            </Button>
          )}
          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Leads</DialogTitle>
                <DialogDescription>
                  Enter leads in CSV format: phone,first_name,last_name,email,company (one per line)
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="import-data">Lead Data</Label>
                  <Textarea
                    id="import-data"
                    placeholder="+15551234567,John,Doe,john@example.com,Acme Corp"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={6}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleImportLeads} disabled={!importText.trim()}>
                    Import Leads
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateDialogOpen || !!editingLead} onOpenChange={(open) => {
            if (!open) {
              setIsCreateDialogOpen(false);
              setEditingLead(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className={editingLead ? "sm:max-w-2xl" : "sm:max-w-md"}>
              <DialogHeader>
                <DialogTitle>{editingLead ? 'Edit Lead' : 'Add New Lead'}</DialogTitle>
                <DialogDescription>
                  {editingLead ? 'Update lead information and view AI activity' : 'Enter the lead details below'}
                </DialogDescription>
              </DialogHeader>
              
              {editingLead ? (
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="details">Lead Details</TabsTrigger>
                    <TabsTrigger value="activity" className="flex items-center gap-1">
                      <Bot className="h-3 w-3" />
                      AI Activity
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="details" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="first-name">First Name</Label>
                        <Input
                          id="first-name"
                          value={formData.first_name}
                          onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="last-name">Last Name</Label>
                        <Input
                          id="last-name"
                          value={formData.last_name}
                          onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="phone">Phone Number *</Label>
                      <Input
                        id="phone"
                        value={formData.phone_number}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone_number: e.target.value }))}
                        placeholder="+1 555 123 4567"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>

                    <div>
                      <Label htmlFor="company">Company</Label>
                      <Input
                        id="company"
                        value={formData.company}
                        onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="status">Status</Label>
                        <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="interested">Interested</SelectItem>
                            <SelectItem value="not_interested">Not Interested</SelectItem>
                            <SelectItem value="callback">Callback</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                            <SelectItem value="do_not_call">Do Not Call</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="priority">Priority</Label>
                        <Select value={formData.priority.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, priority: parseInt(value) }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 - Low</SelectItem>
                            <SelectItem value="2">2 - Normal</SelectItem>
                            <SelectItem value="3">3 - Medium</SelectItem>
                            <SelectItem value="4">4 - High</SelectItem>
                            <SelectItem value="5">5 - Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                        rows={3}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setIsCreateDialogOpen(false);
                          setEditingLead(null);
                          resetForm();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleUpdateLead}
                        disabled={!formData.phone_number || isLoading}
                      >
                        Update Lead
                      </Button>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="activity" className="mt-4">
                    <LeadActivityTimeline leadId={editingLead.id} />
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="first-name">First Name</Label>
                      <Input
                        id="first-name"
                        value={formData.first_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="last-name">Last Name</Label>
                      <Input
                        id="last-name"
                        value={formData.last_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      value={formData.phone_number}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone_number: e.target.value }))}
                      placeholder="+1 555 123 4567"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="interested">Interested</SelectItem>
                          <SelectItem value="not_interested">Not Interested</SelectItem>
                          <SelectItem value="callback">Callback</SelectItem>
                          <SelectItem value="converted">Converted</SelectItem>
                          <SelectItem value="do_not_call">Do Not Call</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="priority">Priority</Label>
                      <Select value={formData.priority.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, priority: parseInt(value) }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 - Low</SelectItem>
                          <SelectItem value="2">2 - Normal</SelectItem>
                          <SelectItem value="3">3 - Medium</SelectItem>
                          <SelectItem value="4">4 - High</SelectItem>
                          <SelectItem value="5">5 - Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setIsCreateDialogOpen(false);
                        setEditingLead(null);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleCreateLead}
                      disabled={!formData.phone_number || isLoading}
                    >
                      Create Lead
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <CardTitle>Leads ({leads.length})</CardTitle>
          <CardDescription>
            Manage your prospect database and contact information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox 
                      checked={selectedLeads.length === leads.length && leads.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedLeads(leads.map(l => l.id));
                        } else {
                          setSelectedLeads([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id} className={selectedLeads.includes(lead.id) ? 'bg-muted/50' : ''}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedLeads.includes(lead.id)}
                        onCheckedChange={() => toggleLeadSelection(lead.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400" />
                        <div>
                          <div className="font-medium flex items-center gap-1.5">
                            {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown'}
                            {leadsWithActivity.has(lead.id) && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Bot className="h-3.5 w-3.5 text-purple-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Recent AI activity</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {lead.email && (
                            <div className="text-sm text-slate-500 flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {lead.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 font-mono">
                        <Phone className="h-3 w-3 text-slate-400" />
                        {lead.phone_number}
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.company && (
                        <div className="flex items-center gap-1">
                          <Building className="h-3 w-3 text-slate-400" />
                          {lead.company}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(lead.status)}>
                        {lead.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={lead.priority > 3 ? 'destructive' : lead.priority > 2 ? 'secondary' : 'outline'}>
                        {lead.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setDetailLead(lead)}
                          aria-label="View lead details"
                        >
                          <User className="h-3 w-3" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => startEdit(lead)}
                          aria-label="Edit lead"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLeadToDelete(lead)}
                          aria-label="Delete lead"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {leads.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No leads found. Add some leads to get started.
            </div>
          )}
        </CardContent>
      </Card>

      <LeadDetailDialog
        lead={detailLead}
        open={!!detailLead}
        onOpenChange={(open) => {
          if (!open) setDetailLead(null);
        }}
        onLeadUpdated={() => {
          loadLeads();
        }}
      />

      <AlertDialog open={!!leadToDelete} onOpenChange={(open) => {
        if (!open) setLeadToDelete(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the lead. If the lead has call/SMS history, we’ll archive it (Do Not Call) instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => leadToDelete && deleteOrArchiveLead(leadToDelete)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LeadManager;
