
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRetellAI } from '@/hooks/useRetellAI';
import { Trash2, Edit, RefreshCw } from 'lucide-react';

interface RetellPhoneNumber {
  phone_number: string;
  nickname?: string;
  inbound_agent_id?: string;
  outbound_agent_id?: string;
  termination_uri?: string;
}

interface Agent {
  agent_id: string;
  agent_name: string;
}

const RetellAIManager = () => {
  const [retellNumbers, setRetellNumbers] = useState<RetellPhoneNumber[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newAgentName, setNewAgentName] = useState('');
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    nickname: '',
    agentId: ''
  });
  const { toast } = useToast();
  const { 
    listPhoneNumbers, 
    updatePhoneNumber, 
    deletePhoneNumber, 
    listAgents,
    createAgent,
    isLoading 
  } = useRetellAI();

  useEffect(() => {
    loadRetellData();
  }, []);

  const loadRetellData = async () => {
    const [numbersData, agentsData] = await Promise.all([
      listPhoneNumbers(),
      listAgents()
    ]);

    if (numbersData) {
      setRetellNumbers(numbersData);
    }
    
    if (agentsData) {
      setAgents(agentsData);
    }
  };

  const handleRefresh = () => {
    loadRetellData();
    toast({
      title: "Data Refreshed",
      description: "Retell AI data has been updated",
    });
  };

  const handleEditStart = (number: RetellPhoneNumber) => {
    setEditingNumber(number.phone_number);
    setEditForm({
      nickname: number.nickname || '',
      agentId: number.inbound_agent_id || ''
    });
  };

  const handleEditSave = async (phoneNumber: string) => {
    const success = await updatePhoneNumber(
      phoneNumber, 
      editForm.agentId || undefined, 
      editForm.nickname || undefined
    );
    
    if (success) {
      setEditingNumber(null);
      loadRetellData();
    }
  };

  const handleEditCancel = () => {
    setEditingNumber(null);
    setEditForm({ nickname: '', agentId: '' });
  };

  const handleDelete = async (phoneNumber: string) => {
    if (window.confirm(`Are you sure you want to delete ${phoneNumber} from Retell AI?`)) {
      const success = await deletePhoneNumber(phoneNumber);
      if (success) {
        loadRetellData();
      }
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgentName.trim()) {
      toast({
        title: "Error",
        description: "Please enter an agent name",
        variant: "destructive"
      });
      return;
    }

    const success = await createAgent(newAgentName);
    if (success) {
      setNewAgentName('');
      loadRetellData();
    }
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.agent_id === agentId);
    return agent ? agent.agent_name : agentId;
  };

  return (
    <div className="space-y-6">
      {/* Agent Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Retell AI Agents</span>
            <Button 
              onClick={handleRefresh} 
              variant="outline" 
              size="sm"
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>Manage your AI agents for phone calls</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <Label htmlFor="agentName">Create New Agent</Label>
              <Input
                id="agentName"
                placeholder="Agent name"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleCreateAgent}
                disabled={isLoading}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Create Agent
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Existing Agents ({agents.length})</Label>
            <div className="flex flex-wrap gap-2">
              {agents.map((agent) => (
                <Badge key={agent.agent_id} variant="outline">
                  {agent.agent_name}
                </Badge>
              ))}
              {agents.length === 0 && (
                <span className="text-gray-500 text-sm">No agents found</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phone Numbers Management */}
      <Card>
        <CardHeader>
          <CardTitle>Retell AI Phone Numbers</CardTitle>
          <CardDescription>Manage phone numbers in your Retell AI account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Nickname</TableHead>
                  <TableHead>Assigned Agent</TableHead>
                  <TableHead>Termination URI</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retellNumbers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No phone numbers found in Retell AI. Import numbers from your main dashboard.
                    </TableCell>
                  </TableRow>
                ) : (
                  retellNumbers.map((number) => (
                    <TableRow key={number.phone_number}>
                      <TableCell className="font-mono">{number.phone_number}</TableCell>
                      <TableCell>
                        {editingNumber === number.phone_number ? (
                          <Input
                            value={editForm.nickname}
                            onChange={(e) => setEditForm(prev => ({ ...prev, nickname: e.target.value }))}
                            placeholder="Enter nickname"
                            className="w-32"
                          />
                        ) : (
                          <span className="text-gray-600">
                            {number.nickname || 'No nickname'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingNumber === number.phone_number ? (
                          <select
                            value={editForm.agentId}
                            onChange={(e) => setEditForm(prev => ({ ...prev, agentId: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm"
                          >
                            <option value="">No agent</option>
                            {agents.map((agent) => (
                              <option key={agent.agent_id} value={agent.agent_id}>
                                {agent.agent_name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-600">
                            {number.inbound_agent_id ? getAgentName(number.inbound_agent_id) : 'No agent assigned'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {number.termination_uri || 'Not set'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {editingNumber === number.phone_number ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleEditSave(number.phone_number)}
                                disabled={isLoading}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleEditCancel}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditStart(number)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(number.phone_number)}
                                disabled={isLoading}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RetellAIManager;
