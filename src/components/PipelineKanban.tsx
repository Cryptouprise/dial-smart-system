import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePipelineManagement } from '@/hooks/usePipelineManagement';
import { LeadDetailDialog } from '@/components/LeadDetailDialog';
import { Plus, Users, Phone, Calendar, ArrowRight, Filter, Mail, Building, Bot, Clock } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { format } from 'date-fns';

const PipelineKanban = () => {
  const { 
    dispositions, 
    pipelineBoards, 
    leadPositions, 
    isLoading,
    createDisposition,
    createPipelineBoard,
    moveLeadToPipeline,
    refetch
  } = usePipelineManagement();
  
  const [newDisposition, setNewDisposition] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    pipeline_stage: ''
  });
  
  const [filterDisposition, setFilterDisposition] = useState('all');
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isLeadDetailOpen, setIsLeadDetailOpen] = useState(false);

  // Group leads by pipeline board
  const groupedLeads = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    
    pipelineBoards.forEach(board => {
      groups[board.id] = leadPositions
        .filter(position => position.pipeline_board_id === board.id)
        .filter(position => filterDisposition === 'all' || 
          (board.disposition && board.disposition.name === filterDisposition))
        .sort((a, b) => a.position - b.position);
    });
    
    return groups;
  }, [pipelineBoards, leadPositions, filterDisposition]);

  const handleCreateDisposition = async () => {
    if (!newDisposition.name.trim()) {
      return;
    }
    
    setIsCreating(true);
    try {
      const disposition = await createDisposition({
        name: newDisposition.name,
        description: newDisposition.description,
        color: newDisposition.color,
        pipeline_stage: newDisposition.pipeline_stage || newDisposition.name.toLowerCase().replace(/\s+/g, '_'),
        auto_actions: []
      });

      if (disposition) {
        await createPipelineBoard({
          name: newDisposition.name,
          description: newDisposition.description,
          disposition_id: disposition.id,
          position: pipelineBoards.length,
          settings: {
            autoMove: false,
            maxLeads: 100,
            sortBy: 'created_at',
            notifications: true
          }
        });
      }
      
      setNewDisposition({
        name: '',
        description: '',
        color: '#3B82F6',
        pipeline_stage: ''
      });
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error creating disposition:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;
    
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const leadPosition = leadPositions.find(pos => pos.id === draggableId);
    if (!leadPosition) return;

    await moveLeadToPipeline(
      leadPosition.lead_id, 
      destination.droppableId,
      'Moved via Kanban board'
    );
  };

  const handleLeadClick = (lead: any) => {
    setSelectedLead(lead);
    setIsLeadDetailOpen(true);
  };

  const getLeadSummary = (leadPositions: any[]) => {
    return leadPositions.reduce((acc, pos) => {
      if (pos.lead) {
        acc.total += 1;
        if (pos.lead.status === 'new') acc.new += 1;
        if (pos.lead.last_contacted_at) acc.contacted += 1;
      }
      return acc;
    }, { total: 0, new: 0, contacted: 0 });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading pipeline...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header with filters and actions */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-foreground">Lead Pipeline</h2>
            <p className="text-muted-foreground">Manage leads through your sales pipeline</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={filterDisposition}
                onChange={(e) => setFilterDisposition(e.target.value)}
                className="border rounded px-3 py-1 text-sm bg-background"
              >
                <option value="all">All Dispositions</option>
                {dispositions.map(disposition => (
                  <option key={disposition.id} value={disposition.name}>
                    {disposition.name}
                  </option>
                ))}
              </select>
            </div>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Pipeline Stage
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Pipeline Stage</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="stage-name">Stage Name *</Label>
                    <Input
                      id="stage-name"
                      placeholder="e.g., Qualified Lead"
                      value={newDisposition.name}
                      onChange={(e) => setNewDisposition(prev => ({ 
                        ...prev, 
                        name: e.target.value,
                        pipeline_stage: e.target.value.toLowerCase().replace(/\s+/g, '_')
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stage-description">Description</Label>
                    <Textarea
                      id="stage-description"
                      placeholder="Describe this pipeline stage..."
                      value={newDisposition.description}
                      onChange={(e) => setNewDisposition(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="stage-color">Color</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="stage-color"
                          type="color"
                          value={newDisposition.color}
                          onChange={(e) => setNewDisposition(prev => ({ ...prev, color: e.target.value }))}
                          className="w-16 h-10 p-1 border rounded"
                        />
                        <Input
                          value={newDisposition.color}
                          onChange={(e) => setNewDisposition(prev => ({ ...prev, color: e.target.value }))}
                          placeholder="#3B82F6"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pipeline-stage">Stage Key</Label>
                      <Input
                        id="pipeline-stage"
                        placeholder="e.g., qualified_leads"
                        value={newDisposition.pipeline_stage}
                        onChange={(e) => setNewDisposition(prev => ({ ...prev, pipeline_stage: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <DialogClose asChild>
                      <Button variant="outline" disabled={isCreating}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button 
                      onClick={handleCreateDisposition} 
                      disabled={!newDisposition.name.trim() || isCreating}
                    >
                      {isCreating ? 'Creating...' : 'Create Stage'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Kanban Board */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {pipelineBoards.map(board => {
              const boardLeads = groupedLeads[board.id] || [];
              const stats = getLeadSummary(boardLeads);
              
              return (
                <Card key={board.id} className="h-fit">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {board.disposition && (
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: board.disposition.color }}
                          />
                        )}
                        {board.name}
                      </CardTitle>
                      <Badge variant="secondary">{stats.total}</Badge>
                    </div>
                    {board.disposition && (
                      <p className="text-sm text-muted-foreground">{board.disposition.description}</p>
                    )}
                    
                    {/* Quick stats */}
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {stats.new} new
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {stats.contacted} contacted
                      </span>
                    </div>
                  </CardHeader>
                  
                  <Droppable droppableId={board.id}>
                    {(provided, snapshot) => (
                      <CardContent
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-2 min-h-[200px] ${
                          snapshot.isDraggingOver ? 'bg-primary/5' : ''
                        }`}
                      >
                        {boardLeads.map((position, index) => (
                          <Draggable 
                            key={position.id} 
                            draggableId={position.id} 
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => position.lead && handleLeadClick(position.lead)}
                                className={`p-3 bg-card border rounded-lg shadow-sm hover:shadow-md hover:border-primary/50 transition-all cursor-pointer ${
                                  snapshot.isDragging ? 'rotate-2 shadow-lg' : ''
                                }`}
                              >
                                {position.lead && (
                                  <div className="space-y-2">
                                    {/* Lead name and status */}
                                    <div className="flex items-center justify-between">
                                      <h4 className="font-medium text-sm">
                                        {[position.lead.first_name, position.lead.last_name].filter(Boolean).join(' ') || 'Unknown'}
                                      </h4>
                                      <Badge 
                                        variant="outline" 
                                        className="text-xs"
                                      >
                                        {position.lead.status}
                                      </Badge>
                                    </div>
                                    
                                    {/* Contact info */}
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Phone className="h-3 w-3" />
                                        {position.lead.phone_number}
                                      </div>
                                      
                                      {position.lead.email && (
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                          <Mail className="h-3 w-3" />
                                          <span className="truncate">{position.lead.email}</span>
                                        </div>
                                      )}
                                      
                                      {position.lead.company && (
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                          <Building className="h-3 w-3" />
                                          {position.lead.company}
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Last contacted / Next callback */}
                                    <div className="flex items-center gap-2 text-xs">
                                      {position.lead.last_contacted_at && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                              <Calendar className="h-3 w-3" />
                                              {format(new Date(position.lead.last_contacted_at), 'MMM d')}
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            Last contacted: {format(new Date(position.lead.last_contacted_at), 'PPp')}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      
                                      {position.lead.next_callback_at && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="secondary" className="text-xs">
                                              <Clock className="h-3 w-3 mr-1" />
                                              Callback
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            Callback: {format(new Date(position.lead.next_callback_at), 'PPp')}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                    
                                    {/* AI indicator and notes */}
                                    <div className="flex items-center justify-between">
                                      {!position.moved_by_user && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className="text-xs">
                                              <Bot className="h-3 w-3 mr-1" />
                                              AI
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            Moved by AI automation
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      
                                      {position.notes && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <p className="text-xs bg-muted p-1 rounded truncate max-w-[150px]">
                                              {position.notes}
                                            </p>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {position.notes}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        
                        {boardLeads.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <Users className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm">No leads in this stage</p>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Droppable>
                </Card>
              );
            })}
          </div>
        </DragDropContext>
        
        {pipelineBoards.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <ArrowRight className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No Pipeline Stages Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first pipeline stage to start organizing your leads
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Pipeline Stage
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Lead Detail Dialog */}
        <LeadDetailDialog
          lead={selectedLead}
          open={isLeadDetailOpen}
          onOpenChange={setIsLeadDetailOpen}
          onLeadUpdated={refetch}
        />
      </div>
    </TooltipProvider>
  );
};

export default PipelineKanban;
