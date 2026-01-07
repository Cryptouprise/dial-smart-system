import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAIBrainContext } from '@/contexts/AIBrainContext';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
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
  Bot,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Headphones
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';

// Parse markdown-style navigation links: [text](nav:/route)
const parseContent = (content: string, onNavigate: (route: string) => void) => {
  const parts = content.split(/(\[([^\]]+)\]\(nav:([^)]+)\))/g);
  const elements: React.ReactNode[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part?.startsWith('[') && part.includes('](nav:')) {
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
        i += 2;
      }
    } else if (part && !parts[i - 1]?.startsWith('[')) {
      elements.push(<span key={i}>{part}</span>);
    }
  }
  
  return elements.length > 0 ? elements : content;
};

// Tool Status Indicator component
const ToolStatusIndicator: React.FC<{ managerName: string }> = ({ managerName }) => (
  <div className="flex justify-start">
    <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg border border-primary/20">
      <Loader2 className="h-3 w-3 animate-spin text-primary" />
      <span className="text-xs text-primary font-medium">
        Contacting {managerName}...
      </span>
    </div>
  </div>
);

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

interface AIAssistantChatProps {
  embedded?: boolean;
}

export const AIAssistantChat: React.FC<AIAssistantChatProps> = ({ embedded = false }) => {
  const {
    messages,
    isLoading,
    isTyping,
    isOpen,
    toolStatus,
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
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const lastSpokenMessageRef = useRef<string | null>(null);
  const pendingTranscriptRef = useRef<string | null>(null);

  // Handle auto-send in hands-free mode
  const handleAutoSend = useCallback(async (text: string) => {
    if (isLoading || !text.trim()) return;
    
    console.log('[HandsFree] Auto-sending:', text);
    setInput('');
    await sendMessage(text);
  }, [isLoading, sendMessage]);

  // Handle voice transcript (for displaying in input)
  const handleVoiceTranscript = useCallback((text: string) => {
    if (!handsFreeMode) {
      // In manual mode, just put it in the input
      setInput(text);
    }
    // In hands-free mode, handleAutoSend handles it
  }, [handsFreeMode]);

  // Voice chat integration
  const { 
    isListening, 
    isSpeaking, 
    isProcessing: isVoiceProcessing,
    isSupported: isVoiceSupported,
    startListening, 
    stopListening,
    restartListening,
    speak,
    stopSpeaking 
  } = useVoiceChat({
    onTranscript: handleVoiceTranscript,
    autoSend: handsFreeMode,
    onAutoSend: handleAutoSend
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Focus input when opened (only if not in hands-free mode)
  useEffect(() => {
    if (isOpen && inputRef.current && !handsFreeMode) {
      inputRef.current.focus();
    }
  }, [isOpen, handsFreeMode]);

  // Keyboard shortcut: Cmd+K to open
  useEffect(() => {
    if (embedded) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          closeChat();
        } else {
          openChat();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        closeChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openChat, closeChat, embedded]);

  // Auto-speak LJ's responses when voice is enabled
  useEffect(() => {
    if (voiceEnabled && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && !lastMessage.isStreaming && lastMessage.id !== lastSpokenMessageRef.current) {
        lastSpokenMessageRef.current = lastMessage.id;
        // Strip markdown navigation links for cleaner speech
        const cleanContent = lastMessage.content.replace(/\[([^\]]+)\]\(nav:[^)]+\)/g, '$1');
        
        // In hands-free mode, restart listening after speaking finishes
        if (handsFreeMode) {
          speak(cleanContent, () => {
            // Small delay before restarting to prevent audio feedback
            setTimeout(() => {
              if (handsFreeMode && !isLoading) {
                startListening(true);
              }
            }, 300);
          });
        } else {
          speak(cleanContent);
        }
      }
    }
  }, [messages, voiceEnabled, speak, handsFreeMode, startListening, isLoading]);

  // Start listening when hands-free mode is enabled
  useEffect(() => {
    if (handsFreeMode && isOpen && !isListening && !isSpeaking && !isLoading) {
      startListening(true);
    }
    
    // Stop listening when hands-free is disabled or chat closes
    if (!handsFreeMode || !isOpen) {
      if (isListening) {
        stopListening();
      }
    }
  }, [handsFreeMode, isOpen, isListening, isSpeaking, isLoading, startListening, stopListening]);

  // Toggle hands-free mode
  const toggleHandsFree = useCallback(() => {
    const newState = !handsFreeMode;
    setHandsFreeMode(newState);
    
    if (newState) {
      // Enable voice output too when going hands-free
      setVoiceEnabled(true);
      // Start listening immediately
      if (!isListening && !isSpeaking) {
        startListening(true);
      }
    } else {
      // Stop listening when disabling hands-free
      stopListening();
    }
  }, [handsFreeMode, isListening, isSpeaking, startListening, stopListening]);

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

  // Manual mic toggle (for non-hands-free mode)
  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening(false);
    }
  };

  // Render chat content (shared between embedded and floating modes)
  const renderChatContent = () => {
    if (showHistory) {
      return (
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
              archivedConversations.map((conv) => (
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
              ))
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
      );
    }

    return (
      <>
        <ScrollArea className="flex-1 px-3 md:px-4" ref={scrollRef}>
          <div className="space-y-3 py-3">
            {messages.length === 0 && (
              <div className="text-center py-4 md:py-8">
                <Sparkles className="h-10 w-10 md:h-12 md:w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-xs md:text-sm text-muted-foreground mb-3">
                  Hey! I'm LJ. What can I help you with?
                </p>
                <div className="flex flex-wrap gap-1.5 md:gap-2 justify-center">
                  <QuickActionButton
                    label="Status"
                    onClick={() => quickActions.status()}
                    icon={<Zap className="h-3 w-3" />}
                  />
                  <QuickActionButton
                    label="Workflow"
                    onClick={() => sendMessage('Help me create a workflow')}
                  />
                  <QuickActionButton
                    label="Send SMS"
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

            {/* Tool Status Indicator OR Typing dots */}
            {isTyping && (
              toolStatus.isExecuting && toolStatus.managerName ? (
                <ToolStatusIndicator managerName={toolStatus.managerName} />
              ) : (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Hands-free listening indicator */}
            {handsFreeMode && isListening && (
              <div className="flex justify-center">
                <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-green-600 font-medium">
                    Listening... Just speak
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 md:p-4 border-t flex-shrink-0">
          {/* Hands-free toggle row */}
          {isVoiceSupported && (
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Headphones className={cn("h-4 w-4", handsFreeMode ? "text-green-500" : "text-muted-foreground")} />
                <span className="text-xs text-muted-foreground">Hands-Free</span>
              </div>
              <Switch
                checked={handsFreeMode}
                onCheckedChange={toggleHandsFree}
                className="scale-75"
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                handsFreeMode && isListening 
                  ? "🎤 Listening..." 
                  : isListening 
                    ? "Listening..." 
                    : "Ask LJ anything..."
              }
              disabled={isLoading || (handsFreeMode && isListening)}
              className="flex-1 text-sm h-9 md:h-10"
            />
            {/* Microphone Button (only in non-hands-free mode) */}
            {!handsFreeMode && (
              <Button
                type="button"
                size="icon"
                variant={isListening ? "destructive" : "outline"}
                onClick={handleMicToggle}
                disabled={isLoading || isSpeaking}
                className="h-9 w-9 md:h-10 md:w-10 flex-shrink-0"
                title={isListening ? "Stop listening" : "Voice input"}
              >
                {isListening ? (
                  <MicOff className="h-4 w-4 animate-pulse" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button 
              type="submit" 
              size="icon" 
              disabled={isLoading || !input.trim() || (handsFreeMode && isListening)} 
              className="h-9 w-9 md:h-10 md:w-10 flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          
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
    );
  };

  // Embedded mode - always show the card inline
  if (embedded) {
    return (
      <Card className="w-full h-full flex flex-col overflow-hidden">
        <CardHeader className="pb-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Lady Jarvis</CardTitle>
                <p className="text-[10px] text-muted-foreground -mt-0.5">Your AI Assistant • LJ</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Voice Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (isSpeaking) stopSpeaking();
                  setVoiceEnabled(!voiceEnabled);
                }}
                className="h-8 w-8"
                title={voiceEnabled ? "Disable voice responses" : "Enable voice responses"}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4" />}
              </Button>
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          {renderChatContent()}
        </CardContent>
      </Card>
    );
  }

  // Closed state - floating button
  if (!isOpen) {
    return (
      <Button
        onClick={openChat}
        className="fixed bottom-[5.5rem] md:bottom-6 right-3 md:right-6 h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg z-40 bg-primary hover:bg-primary/90"
        size="icon"
        title="Ask Lady Jarvis (⌘K)"
      >
        <Bot className="h-5 w-5 md:h-6 md:w-6" />
        <span className="sr-only">Ask Lady Jarvis</span>
      </Button>
    );
  }

  // Open state - floating chat card
  return (
    <Card className="fixed bottom-[5.5rem] md:bottom-6 right-2 left-2 md:left-auto md:right-6 md:w-96 h-[60vh] md:h-[500px] max-h-[calc(100vh-8rem)] shadow-2xl z-40 flex flex-col overflow-hidden">
      <CardHeader className="pb-2 flex-shrink-0 bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <div>
              <CardTitle className="text-lg">Lady Jarvis</CardTitle>
              <p className="text-[10px] text-primary-foreground/70 -mt-0.5">Your AI Assistant • LJ</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!showHistory && (
              <>
                {/* Voice Toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (isSpeaking) stopSpeaking();
                    setVoiceEnabled(!voiceEnabled);
                  }}
                  className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                  title={voiceEnabled ? "Disable voice responses" : "Enable voice responses"}
                >
                  {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleShowHistory}
                  className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                  title="View conversation history"
                >
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearMessages}
                  className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
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
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-primary-foreground/70 hidden md:block">
          {showHistory ? 'Your conversation history' : (
            <>Press <kbd className="px-1 py-0.5 bg-primary-foreground/20 rounded text-xs">⌘K</kbd> to toggle</>
          )}
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {renderChatContent()}
      </CardContent>
    </Card>
  );
};

export default AIAssistantChat;
