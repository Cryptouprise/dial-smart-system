import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAIBrainContext } from '@/contexts/AIBrainContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  MessageSquare, 
  X, 
  Send, 
  ThumbsUp, 
  ThumbsDown, 
  RefreshCw,
  Loader2,
  Trash2,
  Sparkles,
  ChevronRight,
  Zap,
  History,
  Archive,
  Activity,
  Target,
  Brain
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

// Parse markdown-style navigation links: [text](nav:/route)
const parseContent = (content: string, onNavigate: (route: string) => void) => {
  const parts = content.split(/(\[([^\]]+)\]\(nav:([^)]+)\))/g);
  const elements: React.ReactNode[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part?.startsWith('[') && part.includes('](nav:')) {
      // This is a navigation link
      const text = parts[i + 1];
      const route = parts[i + 2];
      if (text && route) {
        elements.push(
          <button
            key={i}
            onClick={() => onNavigate(route)}
            className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
          >
            {text}
            <ChevronRight className="h-3 w-3" />
          </button>
        );
        i += 2; // Skip the captured groups
      }
    } else if (part && !parts[i - 1]?.startsWith('[')) {
      // Regular text
      elements.push(<span key={i}>{part}</span>);
    }
  }
  
  return elements.length > 0 ? elements : content;
};

const QuickActionButton: React.FC<{
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}> = ({ label, onClick, icon }) => (
  <Button
    variant="outline"
    size="sm"
    onClick={onClick}
    className="text-xs h-7 gap-1"
  >
    {icon}
    {label}
  </Button>
);

export const AIBrainChat: React.FC = () => {
  const {
    messages,
    isLoading,
    isTyping,
    isOpen,
    sendMessage,
    submitFeedback,
    clearMessages,
    retryLastMessage,
    handleNavigation,
    openChat,
    closeChat,
    quickActions,
    loadArchivedConversations,
    loadConversation
  } = useAIBrainContext();

  const [input, setInput] = useState('');
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [archivedConversations, setArchivedConversations] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard shortcut: Cmd+K to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          closeChat();
        } else {
          openChat();
        }
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        closeChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openChat, closeChat]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const message = input;
    setInput('');
    await sendMessage(message);
  };

  const handleFeedback = async (messageId: string, rating: 'up' | 'down', content: string) => {
    if (feedbackGiven.has(messageId)) return;
    
    const userMessage = messages.find(m => m.role === 'user' && messages.indexOf(m) < messages.findIndex(m2 => m2.id === messageId));
    await submitFeedback(messageId, rating, userMessage?.content || '', content);
    setFeedbackGiven(prev => new Set([...prev, messageId]));
  };

  const onNavigate = useCallback((route: string) => {
    handleNavigation(route);
    navigate(route);
  }, [handleNavigation, navigate]);

  const handleShowHistory = async () => {
    setShowHistory(true);
    const conversations = await loadArchivedConversations();
    setArchivedConversations(conversations);
  };

  const handleLoadConversation = async (convId: string) => {
    await loadConversation(convId);
    setShowHistory(false);
  };

  if (!isOpen) {
    return (
      <Button
        onClick={openChat}
        className="fixed bottom-[5.5rem] md:bottom-4 right-3 md:right-4 h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg z-40"
        size="icon"
      >
        <MessageSquare className="h-5 w-5 md:h-6 md:w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-20 md:bottom-4 right-2 left-2 md:left-auto md:right-4 md:w-96 h-[60vh] md:h-[500px] max-h-[calc(100vh-8rem)] shadow-2xl z-40 flex flex-col overflow-hidden">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Assistant</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {!showHistory && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleShowHistory}
                  className="h-8 w-8"
                  title="View conversation history"
                >
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearMessages}
                  className="h-8 w-8"
                  title="Clear conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={closeChat}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground hidden md:block">
          {showHistory ? 'Your conversation history' : (
            <>Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">⌘K</kbd> to toggle</>
          )}
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {showHistory ? (
          /* Conversation History View */
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-2 py-4">
              {archivedConversations.length === 0 ? (
                <div className="text-center py-8">
                  <Archive className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-sm text-muted-foreground">
                    No archived conversations yet
                  </p>
                </div>
              ) : (
                <>
                  {archivedConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleLoadConversation(conv.id)}
                      className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm truncate">
                          {conv.title || 'Untitled conversation'}
                        </span>
                        <Archive className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(conv.updated_at).toLocaleDateString()} at{' '}
                        {new Date(conv.updated_at).toLocaleTimeString()}
                      </p>
                    </button>
                  ))}
                </>
              )}
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => setShowHistory(false)}
              >
                Back to Chat
              </Button>
            </div>
          </ScrollArea>
        ) : (
          <>
            {/* Messages */}
            <ScrollArea className="flex-1 px-3 md:px-4" ref={scrollRef}>
              <div className="space-y-3 py-3">
                {messages.length === 0 && (
                  <div className="text-center py-4 md:py-8">
                    <Sparkles className="h-10 w-10 md:h-12 md:w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-xs md:text-sm text-muted-foreground mb-3">
                      I can help manage your dialer. Try:
                    </p>
                    <div className="flex flex-wrap gap-1.5 md:gap-2 justify-center">
                      <QuickActionButton
                        label="System Status"
                        onClick={() => sendMessage("What's going on with the system today?")}
                        icon={<Activity className="h-3 w-3" />}
                      />
                      <QuickActionButton
                        label="Goals"
                        onClick={() => sendMessage("How are we doing on our goals?")}
                        icon={<Target className="h-3 w-3" />}
                      />
                      <QuickActionButton
                        label="AI Insights"
                        onClick={() => sendMessage("What has the AI learned recently?")}
                        icon={<Brain className="h-3 w-3" />}
                      />
                      <QuickActionButton
                        label="Workflow"
                        onClick={() => sendMessage('Help me create a workflow')}
                        icon={<Zap className="h-3 w-3" />}
                      />
                    </div>
                  </div>
                )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[90%] rounded-lg px-2.5 py-1.5 md:px-3 md:py-2',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <div className="text-xs md:text-sm whitespace-pre-wrap break-words">
                    {message.role === 'assistant' 
                      ? parseContent(message.content, onNavigate)
                      : message.content
                    }
                  </div>
                  
                  {/* Feedback buttons for assistant messages */}
                  {message.role === 'assistant' && !feedbackGiven.has(message.id) && (
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleFeedback(message.id, 'up', message.content)}
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleFeedback(message.id, 'down', message.content)}
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  
                  {feedbackGiven.has(message.id) && (
                    <p className="text-xs text-muted-foreground mt-1">Thanks for the feedback!</p>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 md:p-4 border-t flex-shrink-0">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything..."
                disabled={isLoading}
                className="flex-1 text-sm h-9 md:h-10"
              />
              <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="h-9 w-9 md:h-10 md:w-10 flex-shrink-0">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          
          {/* Retry button if last message was an error */}
            {messages.length > 0 && messages[messages.length - 1]?.content?.includes('error') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={retryLastMessage}
                className="mt-2 w-full"
              >
                <RefreshCw className="h-3 w-3 mr-2" />
                Retry
              </Button>
            )}
          </div>
        </>
        )}
      </CardContent>
    </Card>
  );
};

export default AIBrainChat;
