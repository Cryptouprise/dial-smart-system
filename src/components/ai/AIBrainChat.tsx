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
  Zap
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
    quickActions
  } = useAIBrainContext();

  const [input, setInput] = useState('');
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set());
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

  if (!isOpen) {
    return (
      <Button
        onClick={openChat}
        className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50"
        size="icon"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 h-[600px] shadow-2xl z-50 flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Assistant</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={clearMessages}
              className="h-8 w-8"
              title="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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
        <p className="text-xs text-muted-foreground">
          Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">⌘K</kbd> to toggle
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="space-y-4 py-4">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  I can help you manage your dialer system. Try asking me to:
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <QuickActionButton
                    label="System Status"
                    onClick={() => quickActions.status()}
                    icon={<Zap className="h-3 w-3" />}
                  />
                  <QuickActionButton
                    label="Create Workflow"
                    onClick={() => sendMessage('Help me create a workflow')}
                  />
                  <QuickActionButton
                    label="Send SMS Blast"
                    onClick={() => sendMessage('I want to send an SMS blast')}
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
                    'max-w-[85%] rounded-lg px-3 py-2',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <div className="text-sm whitespace-pre-wrap">
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
        <div className="p-4 border-t">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything... (try /help)"
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
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
      </CardContent>
    </Card>
  );
};

export default AIBrainChat;
