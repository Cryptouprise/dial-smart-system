import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  History, 
  FileEdit, 
  Lightbulb, 
  MessageSquare, 
  Zap, 
  BarChart3,
  Plus,
  Trash2,
  Eye,
  Bot,
  User,
  Sparkles
} from 'lucide-react';
import { useAgentImprovementHistory, ImprovementType, CreatedBy } from '@/hooks/useAgentImprovementHistory';
import { formatDistanceToNow } from 'date-fns';

interface AgentImprovementHistoryProps {
  agentId: string;
  agentName?: string;
}

const getTypeIcon = (type: ImprovementType) => {
  switch (type) {
    case 'script_update': return <FileEdit className="h-4 w-4 text-blue-500" />;
    case 'analysis_insight': return <Lightbulb className="h-4 w-4 text-yellow-500" />;
    case 'manual_note': return <MessageSquare className="h-4 w-4 text-green-500" />;
    case 'auto_optimization': return <Zap className="h-4 w-4 text-purple-500" />;
    case 'performance_review': return <BarChart3 className="h-4 w-4 text-orange-500" />;
  }
};

const getTypeLabel = (type: ImprovementType) => {
  switch (type) {
    case 'script_update': return 'Script Update';
    case 'analysis_insight': return 'Analysis Insight';
    case 'manual_note': return 'Manual Note';
    case 'auto_optimization': return 'Auto-Optimization';
    case 'performance_review': return 'Performance Review';
  }
};

const getCreatorIcon = (createdBy: CreatedBy) => {
  switch (createdBy) {
    case 'lady_jarvis': return <Bot className="h-3 w-3" />;
    case 'autonomous': return <Sparkles className="h-3 w-3" />;
    default: return <User className="h-3 w-3" />;
  }
};

const getCreatorLabel = (createdBy: CreatedBy) => {
  switch (createdBy) {
    case 'lady_jarvis': return 'Lady Jarvis';
    case 'autonomous': return 'Autonomous';
    default: return 'User';
  }
};

export const AgentImprovementHistory: React.FC<AgentImprovementHistoryProps> = ({
  agentId,
  agentName
}) => {
  const { 
    improvements, 
    isLoading, 
    loadImprovements, 
    addImprovement,
    deleteImprovement 
  } = useAgentImprovementHistory();
  
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [selectedImprovement, setSelectedImprovement] = useState<any>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (agentId) {
      loadImprovements(agentId);
    }
  }, [agentId, loadImprovements]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsAdding(true);
    
    await addImprovement({
      agent_id: agentId,
      agent_name: agentName,
      improvement_type: 'manual_note',
      title: newNote.substring(0, 100),
      details: { note: newNote, context: 'Manual note added by user' },
      created_by: 'user'
    });
    
    setNewNote('');
    setShowAddNote(false);
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this improvement record?')) {
      await deleteImprovement(id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              Improvement History
            </CardTitle>
            <CardDescription>
              Track all script changes, analyses, and notes for {agentName || 'this agent'}
            </CardDescription>
          </div>
          <Button onClick={() => setShowAddNote(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Note
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading history...
          </div>
        ) : improvements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No improvement history yet</p>
            <p className="text-sm mt-1">Script changes and insights will appear here</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {improvements.map((improvement) => (
                <div 
                  key={improvement.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">
                        {getTypeIcon(improvement.improvement_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="outline" className="text-xs">
                            {getTypeLabel(improvement.improvement_type)}
                          </Badge>
                          <Badge variant="secondary" className="text-xs flex items-center gap-1">
                            {getCreatorIcon(improvement.created_by)}
                            {getCreatorLabel(improvement.created_by)}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm">{improvement.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(improvement.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedImprovement(improvement)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(improvement.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Add Note Dialog */}
      <Dialog open={showAddNote} onOpenChange={setShowAddNote}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Enter your note about this agent..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddNote(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNote} disabled={!newNote.trim() || isAdding}>
              {isAdding ? 'Saving...' : 'Save Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={!!selectedImprovement} onOpenChange={() => setSelectedImprovement(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedImprovement && getTypeIcon(selectedImprovement.improvement_type)}
              {selectedImprovement?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedImprovement && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {getTypeLabel(selectedImprovement.improvement_type)}
                </Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  {getCreatorIcon(selectedImprovement.created_by)}
                  {getCreatorLabel(selectedImprovement.created_by)}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(selectedImprovement.created_at), { addSuffix: true })}
                </span>
              </div>
              
              <div className="bg-muted rounded-lg p-4">
                <h4 className="font-medium mb-2">Details</h4>
                <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-[300px]">
                  {JSON.stringify(selectedImprovement.details, null, 2)}
                </pre>
              </div>

              {selectedImprovement.details?.old_prompt && selectedImprovement.details?.new_prompt && (
                <div className="space-y-2">
                  <h4 className="font-medium">Script Changes</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-red-500/10 rounded p-3">
                      <p className="text-xs font-medium text-red-600 mb-1">Before</p>
                      <p className="text-sm">{selectedImprovement.details.old_prompt.substring(0, 200)}...</p>
                    </div>
                    <div className="bg-green-500/10 rounded p-3">
                      <p className="text-xs font-medium text-green-600 mb-1">After</p>
                      <p className="text-sm">{selectedImprovement.details.new_prompt.substring(0, 200)}...</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AgentImprovementHistory;
