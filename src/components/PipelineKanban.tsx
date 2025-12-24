import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { usePipelineManagement } from '@/hooks/usePipelineManagement';
import { LeadDetailDialog } from '@/components/LeadDetailDialog';
import { Plus, Users, Phone, Mail, GripVertical, Building2 } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useDemoData } from '@/hooks/useDemoData';

const PipelineKanban = () => {
  const { 
    dispositions: realDispositions, 
    pipelineBoards: realPipelineBoards, 
    leadPositions: realLeadPositions, 
    isLoading,
    createDisposition,
    createPipelineBoard,
    moveLeadToPipeline,
  } = usePipelineManagement();
  
  const { 
    isDemoMode, 
    pipelineBoards: demoPipelineBoards, 
    dispositions: demoDispositions, 
    leadPositions: demoLeadPositions,
  } = useDemoData();
  
  const dispositions = isDemoMode && demoDispositions ? demoDispositions : realDispositions;
  const pipelineBoards = isDemoMode && demoPipelineBoards ? demoPipelineBoards : realPipelineBoards;
  const leadPositions = isDemoMode && demoLeadPositions ? demoLeadPositions : realLeadPositions;
  
  const [newDisposition, setNewDisposition] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    pipeline_stage: ''
  });
  
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
        .sort((a, b) => a.position - b.position);
    });
    return groups;
  }, [pipelineBoards, leadPositions]);

  const handleCreateDisposition = async () => {
    if (!newDisposition.name.trim()) return;
    
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
          settings: { autoMove: false, maxLeads: 100, sortBy: 'created_at', notifications: true }
        });
      }
      
      setNewDisposition({ name: '', description: '', color: '#3B82F6', pipeline_stage: '' });
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

    await moveLeadToPipeline(leadPosition.lead_id, destination.droppableId, 'Moved via Kanban board');
  };

  const handleLeadClick = (lead: any) => {
    setSelectedLead(lead);
    setIsLeadDetailOpen(true);
  };

  const getTotalLeads = () => leadPositions.length;
  const getActiveStages = () => pipelineBoards.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading pipeline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {getTotalLeads()} leads across {getActiveStages()} stages
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Stage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Pipeline Stage</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Stage Name</Label>
                <Input
                  placeholder="e.g., Qualified Leads"
                  value={newDisposition.name}
                  onChange={(e) => setNewDisposition(prev => ({ 
                    ...prev, 
                    name: e.target.value,
                    pipeline_stage: e.target.value.toLowerCase().replace(/\s+/g, '_')
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Describe this stage..."
                  value={newDisposition.description}
                  onChange={(e) => setNewDisposition(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={newDisposition.color}
                    onChange={(e) => setNewDisposition(prev => ({ ...prev, color: e.target.value }))}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={newDisposition.color}
                    onChange={(e) => setNewDisposition(prev => ({ ...prev, color: e.target.value }))}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleCreateDisposition} disabled={!newDisposition.name.trim() || isCreating}>
                  {isCreating ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty State */}
      {pipelineBoards.length === 0 ? (
        <Card className="flex-1 flex items-center justify-center">
          <div className="text-center py-16 px-8">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No pipeline stages</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Create your first stage to start organizing leads through your sales process.
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Stage
            </Button>
          </div>
        </Card>
      ) : (
        /* Kanban Board */
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-4 pb-4 min-h-[500px] min-w-max">
              {pipelineBoards.map(board => {
                const boardLeads = groupedLeads[board.id] || [];
                const stageColor = board.disposition?.color || '#6b7280';
                
                return (
                  <div key={board.id} className="w-72 flex-shrink-0">
                    {/* Column Header */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: stageColor }}
                        />
                        <h3 className="font-medium text-sm">{board.name}</h3>
                        <Badge variant="secondary" className="ml-auto text-xs font-normal">
                          {boardLeads.length}
                        </Badge>
                      </div>
                      {board.disposition?.description && (
                        <p className="text-xs text-muted-foreground pl-4 line-clamp-1">
                          {board.disposition.description}
                        </p>
                      )}
                    </div>
                    
                    {/* Droppable Column */}
                    <Droppable droppableId={board.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`rounded-lg border border-dashed p-2 min-h-[400px] transition-colors ${
                            snapshot.isDraggingOver 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border/50 bg-muted/30'
                          }`}
                        >
                          <div className="space-y-2">
                            {boardLeads.map((position, index) => (
                              <Draggable key={position.id} draggableId={position.id} index={index}>
                                {(provided, snapshot) => (
                                  <Card
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    onClick={() => position.lead && handleLeadClick(position.lead)}
                                    className={`cursor-pointer transition-all hover:shadow-md ${
                                      snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20 rotate-1' : ''
                                    }`}
                                  >
                                    <CardContent className="p-3">
                                      {position.lead && (
                                        <div className="flex gap-2">
                                          {/* Drag Handle */}
                                          <div 
                                            {...provided.dragHandleProps}
                                            className="flex items-center text-muted-foreground/50 hover:text-muted-foreground"
                                          >
                                            <GripVertical className="h-4 w-4" />
                                          </div>
                                          
                                          {/* Lead Info */}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                              <span className="font-medium text-sm truncate">
                                                {[position.lead.first_name, position.lead.last_name].filter(Boolean).join(' ') || 'Unknown'}
                                              </span>
                                              <Badge 
                                                variant={position.lead.status === 'new' ? 'default' : 'secondary'}
                                                className="text-[10px] px-1.5 py-0 h-5"
                                              >
                                                {position.lead.status}
                                              </Badge>
                                            </div>
                                            
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Phone className="h-3 w-3 shrink-0" />
                                                <span className="truncate">{position.lead.phone_number}</span>
                                              </div>
                                              
                                              {position.lead.email && (
                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                  <Mail className="h-3 w-3 shrink-0" />
                                                  <span className="truncate">{position.lead.email}</span>
                                                </div>
                                              )}
                                              
                                              {position.lead.company && (
                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                  <Building2 className="h-3 w-3 shrink-0" />
                                                  <span className="truncate">{position.lead.company}</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                            
                            {boardLeads.length === 0 && (
                              <div className="text-center py-8 text-xs text-muted-foreground">
                                Drop leads here
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </div>
        </DragDropContext>
      )}

      {/* Lead Detail Dialog */}
      <LeadDetailDialog
        lead={selectedLead}
        open={isLeadDetailOpen}
        onOpenChange={setIsLeadDetailOpen}
      />
    </div>
  );
};

export default PipelineKanban;
