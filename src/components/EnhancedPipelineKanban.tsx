import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePipelineManagement } from '@/hooks/usePipelineManagement';
import { LeadDetailDialog } from '@/components/LeadDetailDialog';
import { LeadScoreIndicator } from '@/components/LeadScoreIndicator';
import { 
  Plus, 
  Users, 
  Phone, 
  Calendar, 
  Filter, 
  Mail, 
  Building, 
  Bot, 
  Clock, 
  Star, 
  TrendingUp,
  Activity,
  Zap,
  Target,
  MoreHorizontal,
  GripVertical
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { format } from 'date-fns';

const EnhancedPipelineKanban = () => {
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
    color: '#6366f1',
    pipeline_stage: ''
  });
  
  const [filterDisposition, setFilterDisposition] = useState('all');
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isLeadDetailOpen, setIsLeadDetailOpen] = useState(false);

  // Calculate pipeline metrics
  const pipelineMetrics = useMemo(() => {
    const totalLeads = leadPositions.length;
    const activeBoards = pipelineBoards.length;
    const conversionRate = totalLeads > 0 ? Math.round((totalLeads * 0.23)) : 0;
    const velocity = Math.floor(totalLeads * 0.15);
    
    return {
      totalLeads,
      activeBoards,
      conversionRate: Math.min(100, (conversionRate / Math.max(totalLeads, 1)) * 100),
      velocity
    };
  }, [leadPositions, pipelineBoards]);

  // Group leads by pipeline board
  const groupedLeads = useMemo(() => {
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
        color: '#6366f1',
        pipeline_stage: ''
      });
      setIsDialogOpen(false);
      refetch();
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

  const getBoardStats = (boardLeads: any[]) => {
    const total = boardLeads.length;
    const newLeads = boardLeads.filter(pos => pos.lead?.status === 'new').length;
    const contacted = boardLeads.filter(pos => pos.lead?.last_contacted_at).length;
    const highPriority = boardLeads.filter(pos => pos.lead?.priority && pos.lead.priority > 70).length;
    
    return { total, newLeads, contacted, highPriority };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"></div>
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">Loading Pipeline</p>
            <p className="text-sm text-muted-foreground">Fetching your sales data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 p-1">
        {/* Header Section */}
        <div className="flex flex-col gap-6">
          {/* Title & Actions Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Sales Pipeline</h1>
              <p className="text-sm text-muted-foreground">Manage and track your leads through each stage</p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  value={filterDisposition}
                  onChange={(e) => setFilterDisposition(e.target.value)}
                  className="h-9 px-3 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="all">All Stages</option>
                  {dispositions.map(disposition => (
                    <option key={disposition.id} value={disposition.name}>
                      {disposition.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add Stage</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Pipeline Stage</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="stage-name">Stage Name</Label>
                      <Input
                        id="stage-name"
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
                      <Label htmlFor="stage-description">Description</Label>
                      <Textarea
                        id="stage-description"
                        placeholder="Describe the purpose of this stage..."
                        value={newDisposition.description}
                        onChange={(e) => setNewDisposition(prev => ({ ...prev, description: e.target.value }))}
                        rows={2}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="space-y-2">
                        <Label>Color</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={newDisposition.color}
                            onChange={(e) => setNewDisposition(prev => ({ ...prev, color: e.target.value }))}
                            className="w-10 h-10 rounded-md cursor-pointer border border-input"
                          />
                          <Input
                            value={newDisposition.color}
                            onChange={(e) => setNewDisposition(prev => ({ ...prev, color: e.target.value }))}
                            className="w-24 font-mono text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isCreating}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateDisposition} disabled={!newDisposition.name.trim() || isCreating}>
                        {isCreating ? 'Creating...' : 'Create Stage'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{pipelineMetrics.totalLeads}</p>
                    <p className="text-xs text-muted-foreground">Total Leads</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{pipelineMetrics.conversionRate.toFixed(0)}%</p>
                    <p className="text-xs text-muted-foreground">Conversion</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{pipelineMetrics.velocity}</p>
                    <p className="text-xs text-muted-foreground">Daily Velocity</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{pipelineMetrics.activeBoards}</p>
                    <p className="text-xs text-muted-foreground">Active Stages</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Kanban Board */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto pb-4 -mx-1 px-1">
            <div className="flex gap-4 min-w-max">
              {pipelineBoards.map((board) => {
                const boardLeads = groupedLeads[board.id] || [];
                const stats = getBoardStats(boardLeads);
                
                return (
                  <div key={board.id} className="w-80 flex-shrink-0">
                    <Card className="bg-muted/30 border-border h-full">
                      {/* Column Header */}
                      <CardHeader className="p-4 pb-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {board.disposition && (
                              <div 
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: board.disposition.color }}
                              />
                            )}
                            <h3 className="font-semibold text-foreground text-sm">{board.name}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs font-medium px-2 py-0.5">
                              {stats.total}
                            </Badge>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Mini Stats */}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                            {stats.newLeads} new
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                            {stats.contacted} contacted
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                            {stats.highPriority} hot
                          </span>
                        </div>
                      </CardHeader>
                      
                      {/* Droppable Area */}
                      <Droppable droppableId={board.id}>
                        {(provided, snapshot) => (
                          <CardContent
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`p-2 pt-0 min-h-[400px] transition-colors ${
                              snapshot.isDraggingOver ? 'bg-primary/5' : ''
                            }`}
                          >
                            <ScrollArea className="h-[500px]">
                              <div className="space-y-2 pr-2">
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
                                        onClick={() => position.lead && handleLeadClick(position.lead)}
                                        className={`group bg-card border border-border rounded-lg p-3 cursor-pointer transition-all ${
                                          snapshot.isDragging 
                                            ? 'shadow-lg ring-2 ring-primary rotate-1 scale-[1.02]' 
                                            : 'hover:border-primary/50 hover:shadow-sm'
                                        }`}
                                      >
                                        {position.lead && (
                                          <div className="space-y-2">
                                            {/* Card Header */}
                                            <div className="flex items-start justify-between gap-2">
                                              <div {...provided.dragHandleProps} className="pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-foreground text-sm truncate">
                                                  {[position.lead.first_name, position.lead.last_name].filter(Boolean).join(' ') || 'Unknown Lead'}
                                                </h4>
                                                <p className="text-xs text-muted-foreground truncate">{position.lead.phone_number}</p>
                                              </div>
                                              <LeadScoreIndicator priority={position.lead.priority} size="sm" />
                                            </div>
                                            
                                            {/* Contact Info */}
                                            {(position.lead.email || position.lead.company) && (
                                              <div className="space-y-1">
                                                {position.lead.email && (
                                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Mail className="h-3 w-3 shrink-0" />
                                                    <span className="truncate">{position.lead.email}</span>
                                                  </div>
                                                )}
                                                {position.lead.company && (
                                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Building className="h-3 w-3 shrink-0" />
                                                    <span className="truncate">{position.lead.company}</span>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                            
                                            {/* Card Footer */}
                                            <div className="flex items-center justify-between pt-2 border-t border-border">
                                              <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 capitalize">
                                                  {position.lead.status}
                                                </Badge>
                                                {position.lead.last_contacted_at && (
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {format(new Date(position.lead.last_contacted_at), 'MMM d')}
                                                      </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      Last contact: {format(new Date(position.lead.last_contacted_at), 'PPp')}
                                                    </TooltipContent>
                                                  </Tooltip>
                                                )}
                                              </div>
                                              
                                              <div className="flex items-center gap-1">
                                                {position.lead.next_callback_at && (
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 gap-0.5">
                                                        <Clock className="h-2.5 w-2.5" />
                                                        CB
                                                      </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      Callback: {format(new Date(position.lead.next_callback_at), 'PPp')}
                                                    </TooltipContent>
                                                  </Tooltip>
                                                )}
                                                {!position.moved_by_user && (
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 gap-0.5 bg-primary/10 text-primary border-0">
                                                        <Bot className="h-2.5 w-2.5" />
                                                      </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Moved by AI</TooltipContent>
                                                  </Tooltip>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                
                                {boardLeads.length === 0 && (
                                  <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                                      <Users className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <p className="text-sm font-medium text-muted-foreground">No leads</p>
                                    <p className="text-xs text-muted-foreground/70 mt-1">Drag leads here</p>
                                  </div>
                                )}
                                
                                {provided.placeholder}
                              </div>
                            </ScrollArea>
                          </CardContent>
                        )}
                      </Droppable>
                    </Card>
                  </div>
                );
              })}
              
              {/* Add Stage Column */}
              {pipelineBoards.length === 0 && (
                <div className="w-80 flex-shrink-0">
                  <Card className="bg-muted/20 border-dashed border-2 border-muted-foreground/20 h-full min-h-[500px] flex items-center justify-center">
                    <div className="text-center p-6">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                        <Plus className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <h3 className="font-medium text-foreground mb-1">Create Your First Stage</h3>
                      <p className="text-sm text-muted-foreground mb-4">Set up pipeline stages to organize your leads</p>
                      <Button size="sm" onClick={() => setIsDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Stage
                      </Button>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </DragDropContext>

        {/* Lead Detail Dialog */}
        <LeadDetailDialog
          lead={selectedLead}
          open={isLeadDetailOpen}
          onOpenChange={(open) => {
            setIsLeadDetailOpen(open);
            if (!open) setSelectedLead(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
};

export default EnhancedPipelineKanban;
