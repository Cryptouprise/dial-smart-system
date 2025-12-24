import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { usePipelineManagement } from '@/hooks/usePipelineManagement';
import { LeadDetailDialog } from '@/components/LeadDetailDialog';
import { LeadScoreIndicator } from '@/components/LeadScoreIndicator';
import { 
  Plus, 
  Users, 
  Phone, 
  Calendar, 
  ArrowRight, 
  Filter, 
  Mail, 
  Building, 
  Bot, 
  Clock, 
  Star, 
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Target,
  Sparkles,
  BarChart3,
  CheckCircle2,
  AlertCircle
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
    
    // Calculate conversion rate (mock for now)
    const conversionRate = totalLeads > 0 ? Math.round((totalLeads * 0.23)) : 0;
    
    // Calculate velocity (leads moved in last 24h - mock)
    const velocity = Math.floor(totalLeads * 0.15);
    
    return {
      totalLeads,
      activeBoards,
      conversionRate: Math.min(100, (conversionRate / totalLeads) * 100),
      velocity,
      averageTimeInStage: '2.3 days'
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
      'Moved via Enhanced Kanban board'
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
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
            <Sparkles className="h-6 w-6 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-lg font-medium text-slate-700 dark:text-slate-300">Loading Pipeline Intelligence...</p>
          <p className="text-sm text-slate-500">Analyzing your sales data</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Enhanced Header with Metrics */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-1">
          <div className="bg-slate-900/90 backdrop-blur-xl rounded-xl p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-500/20 rounded-xl backdrop-blur-sm">
                    <Target className="h-6 w-6 text-indigo-400" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                      Sales Pipeline
                      <Sparkles className="h-5 w-5 text-yellow-400 animate-pulse" />
                    </h1>
                    <p className="text-indigo-200">AI-Powered Lead Management System</p>
                  </div>
                </div>
              </div>
              
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="flex items-center gap-2 text-white/70 text-sm mb-1">
                    <Users className="h-4 w-4" />
                    <span>Total Leads</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{pipelineMetrics.totalLeads}</div>
                </div>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="flex items-center gap-2 text-white/70 text-sm mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span>Conversion</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{pipelineMetrics.conversionRate.toFixed(1)}%</div>
                </div>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="flex items-center gap-2 text-white/70 text-sm mb-1">
                    <Zap className="h-4 w-4" />
                    <span>Velocity</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{pipelineMetrics.velocity}/day</div>
                </div>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="flex items-center gap-2 text-white/70 text-sm mb-1">
                    <Activity className="h-4 w-4" />
                    <span>Stages</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{pipelineMetrics.activeBoards}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Filter className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            <select
              value={filterDisposition}
              onChange={(e) => setFilterDisposition(e.target.value)}
              className="flex-1 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
            >
              <option value="all">All Pipeline Stages</option>
              {dispositions.map(disposition => (
                <option key={disposition.id} value={disposition.name}>
                  {disposition.name}
                </option>
              ))}
            </select>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all">
                <Plus className="h-5 w-5 mr-2" />
                Create New Stage
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-2xl flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-indigo-500" />
                  Create Pipeline Stage
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5 py-4">
                <div className="space-y-2">
                  <Label htmlFor="stage-name" className="text-sm font-medium">Stage Name *</Label>
                  <Input
                    id="stage-name"
                    placeholder="e.g., Qualified Prospects"
                    value={newDisposition.name}
                    onChange={(e) => setNewDisposition(prev => ({ 
                      ...prev, 
                      name: e.target.value,
                      pipeline_stage: e.target.value.toLowerCase().replace(/\s+/g, '_')
                    }))}
                    className="border-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stage-description" className="text-sm font-medium">Description</Label>
                  <Textarea
                    id="stage-description"
                    placeholder="Describe the purpose of this stage..."
                    value={newDisposition.description}
                    onChange={(e) => setNewDisposition(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="border-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stage-color" className="text-sm font-medium">Stage Color</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="stage-color"
                        type="color"
                        value={newDisposition.color}
                        onChange={(e) => setNewDisposition(prev => ({ ...prev, color: e.target.value }))}
                        className="w-14 h-11 p-1 border-2 rounded-lg cursor-pointer"
                      />
                      <Input
                        value={newDisposition.color}
                        onChange={(e) => setNewDisposition(prev => ({ ...prev, color: e.target.value }))}
                        placeholder="#6366f1"
                        className="flex-1 border-2"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pipeline-stage" className="text-sm font-medium">Stage Key</Label>
                    <Input
                      id="pipeline-stage"
                      placeholder="e.g., qualified_prospects"
                      value={newDisposition.pipeline_stage}
                      onChange={(e) => setNewDisposition(prev => ({ ...prev, pipeline_stage: e.target.value }))}
                      className="border-2"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)}
                    disabled={isCreating}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateDisposition} 
                    disabled={!newDisposition.name.trim() || isCreating}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                  >
                    {isCreating ? 'Creating...' : 'Create Stage'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Enhanced Kanban Board */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {pipelineBoards.map((board, boardIndex) => {
              const boardLeads = groupedLeads[board.id] || [];
              const stats = getBoardStats(boardLeads);
              const completionRate = stats.total > 0 ? (stats.contacted / stats.total) * 100 : 0;
              
              return (
                <div
                  key={board.id}
                  className="relative group"
                  style={{ animationDelay: `${boardIndex * 50}ms` }}
                >
                  {/* Glassmorphic Card with Gradient Border */}
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  
                  <Card className="relative h-full backdrop-blur-sm bg-white/80 dark:bg-slate-900/80 border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-indigo-500/10">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1">
                          {board.disposition && (
                            <div 
                              className="w-4 h-4 rounded-full ring-4 ring-white dark:ring-slate-900 shadow-lg"
                              style={{ backgroundColor: board.disposition.color }}
                            />
                          )}
                          <CardTitle className="text-lg font-bold truncate">
                            {board.name}
                          </CardTitle>
                        </div>
                        <Badge 
                          variant="secondary" 
                          className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-semibold px-3 py-1"
                        >
                          {stats.total}
                        </Badge>
                      </div>
                      
                      {board.disposition?.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
                          {board.disposition.description}
                        </p>
                      )}
                      
                      {/* Enhanced Stats */}
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col items-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400 mb-1" />
                                <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{stats.newLeads}</span>
                                <span className="text-xs text-blue-600 dark:text-blue-400">New</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>New leads in this stage</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col items-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <Phone className="h-4 w-4 text-green-600 dark:text-green-400 mb-1" />
                                <span className="text-sm font-bold text-green-700 dark:text-green-300">{stats.contacted}</span>
                                <span className="text-xs text-green-600 dark:text-green-400">Contact</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>Contacted leads</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col items-center p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                                <Star className="h-4 w-4 text-amber-600 dark:text-amber-400 mb-1" />
                                <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{stats.highPriority}</span>
                                <span className="text-xs text-amber-600 dark:text-amber-400">Hot</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>High priority leads</TooltipContent>
                          </Tooltip>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 dark:text-slate-400">Engagement</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{completionRate.toFixed(0)}%</span>
                          </div>
                          <Progress 
                            value={completionRate} 
                            className="h-2 bg-slate-200 dark:bg-slate-700"
                          />
                        </div>
                      </div>
                    </CardHeader>
                    
                    <Droppable droppableId={board.id}>
                      {(provided, snapshot) => (
                        <CardContent
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`px-4 pb-4 transition-all duration-200 ${
                            snapshot.isDraggingOver 
                              ? 'bg-indigo-50/50 dark:bg-indigo-900/10 ring-2 ring-indigo-400 ring-inset' 
                              : ''
                          }`}
                        >
                          <ScrollArea className="h-[600px] pr-3">
                            <div className="space-y-3">
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
                                      className={`group/card relative p-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-lg hover:border-indigo-400 dark:hover:border-indigo-500 transition-all duration-200 cursor-pointer ${
                                        snapshot.isDragging 
                                          ? 'rotate-2 scale-105 shadow-2xl shadow-indigo-500/30 ring-2 ring-indigo-500 border-indigo-500' 
                                          : 'hover:scale-[1.02]'
                                      }`}
                                    >
                                      {position.lead && (
                                        <div className="space-y-3">
                                          {/* Lead Header */}
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                              <h4 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                                {[position.lead.first_name, position.lead.last_name].filter(Boolean).join(' ') || 'Unknown Lead'}
                                              </h4>
                                              <Badge 
                                                variant="outline" 
                                                className="mt-1.5 text-xs capitalize"
                                              >
                                                {position.lead.status}
                                              </Badge>
                                            </div>
                                            <LeadScoreIndicator priority={position.lead.priority} size="md" />
                                          </div>
                                          
                                          {/* Contact Details */}
                                          <div className="space-y-2 text-sm">
                                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                              <Phone className="h-3.5 w-3.5 shrink-0" />
                                              <span className="truncate font-medium">{position.lead.phone_number}</span>
                                            </div>
                                            
                                            {position.lead.email && (
                                              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                                <Mail className="h-3.5 w-3.5 shrink-0" />
                                                <span className="truncate">{position.lead.email}</span>
                                              </div>
                                            )}
                                            
                                            {position.lead.company && (
                                              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                                <Building className="h-3.5 w-3.5 shrink-0" />
                                                <span className="truncate">{position.lead.company}</span>
                                              </div>
                                            )}
                                          </div>
                                          
                                          {/* Footer */}
                                          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                                            <div className="flex items-center gap-2">
                                              {position.lead.last_contacted_at && (
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                                      <Calendar className="h-3.5 w-3.5" />
                                                      {format(new Date(position.lead.last_contacted_at), 'MMM d')}
                                                    </div>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    Last contact: {format(new Date(position.lead.last_contacted_at), 'PPp')}
                                                  </TooltipContent>
                                                </Tooltip>
                                              )}
                                              
                                              {position.lead.next_callback_at && (
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Badge variant="secondary" className="text-xs gap-1">
                                                      <Clock className="h-3 w-3" />
                                                      Callback
                                                    </Badge>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    Scheduled: {format(new Date(position.lead.next_callback_at), 'PPp')}
                                                  </TooltipContent>
                                                </Tooltip>
                                              )}
                                            </div>
                                            
                                            {!position.moved_by_user && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Badge variant="outline" className="text-xs gap-1 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700">
                                                    <Bot className="h-3 w-3" />
                                                    AI
                                                  </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  Automatically moved by AI
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
                            </div>
                          </ScrollArea>
                          
                          {boardLeads.length === 0 && (
                            <div className="text-center py-12">
                              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Users className="h-8 w-8 text-slate-400" />
                              </div>
                              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No leads yet</p>
                              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Drag leads here to get started</p>
                            </div>
                          )}
                          
                          {provided.placeholder}
                        </CardContent>
                      )}
                    </Droppable>
                  </Card>
                </div>
              );
            })}
          </div>
        </DragDropContext>

        {/* Lead Detail Dialog */}
        {selectedLead && (
          <LeadDetailDialog
            lead={selectedLead}
            isOpen={isLeadDetailOpen}
            onClose={() => {
              setIsLeadDetailOpen(false);
              setSelectedLead(null);
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
};

export default EnhancedPipelineKanban;
