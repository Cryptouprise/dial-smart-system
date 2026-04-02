import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Type declarations for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface UseVoiceChatOptions {
  voiceId?: string;
  onTranscript?: (text: string) => void;
  autoSend?: boolean;
  onAutoSend?: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  silenceTimeout?: number; // ms of silence before auto-sending (default 2500)
}

export const useVoiceChat = (options: UseVoiceChatOptions = {}) => {
  const { 
    voiceId = 'EXAVITQu4vr4xnSDxMaL', 
    onTranscript,
    autoSend = false,
    onAutoSend,
    onInterimTranscript,
    silenceTimeout = 2500
  } = options;
  
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shouldRestartRef = useRef(false);
  const transcriptBufferRef = useRef('');
  const { toast } = useToast();

  // Clear any pending restart
  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  // Clear silence timer
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Flush the accumulated transcript buffer (send it)
  const flushBuffer = useCallback(() => {
    clearSilenceTimer();
    const text = transcriptBufferRef.current.trim();
    if (text.length >= 2) {
      console.log('[Voice] Flushing buffer:', text);
      onTranscript?.(text);
      if (autoSend && onAutoSend) {
        onAutoSend(text);
      }
    }
    transcriptBufferRef.current = '';
    setInterimText('');
    onInterimTranscript?.('');
  }, [autoSend, onAutoSend, onTranscript, onInterimTranscript, clearSilenceTimer]);

  // Stop listening completely
  const stopListening = useCallback(() => {
    clearRestartTimeout();
    clearSilenceTimer();
    shouldRestartRef.current = false;
    
    // Flush any remaining buffer before stopping
    if (transcriptBufferRef.current.trim()) {
      flushBuffer();
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  }, [clearRestartTimeout, clearSilenceTimer, flushBuffer]);

  // Reset silence timer — called whenever new speech is detected
  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    if (autoSend) {
      silenceTimerRef.current = setTimeout(() => {
        console.log('[Voice] Silence timeout reached, flushing buffer');
        flushBuffer();
      }, silenceTimeout);
    }
  }, [autoSend, silenceTimeout, clearSilenceTimer, flushBuffer]);

  // Initialize speech recognition
  const startListening = useCallback((continuous = false) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'Voice not supported',
        description: 'Your browser does not support speech recognition.',
        variant: 'destructive',
      });
      return;
    }

    // If already listening, stop first
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    shouldRestartRef.current = continuous;
    transcriptBufferRef.current = '';
    setInterimText('');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    // In continuous/hands-free mode: enable continuous + interim results
    // This prevents cutting the user off after a single phrase
    if (continuous) {
      recognition.continuous = true;
      recognition.interimResults = true;
    } else {
      recognition.continuous = false;
      recognition.interimResults = false;
    }
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      console.log('[Voice] Started listening (continuous:', continuous, ')');
    };

    recognition.onresult = (event) => {
      if (continuous) {
        // In continuous mode: accumulate final results, show interim
        let finalText = '';
        let currentInterim = '';
        
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript + ' ';
          } else {
            currentInterim += result[0].transcript;
          }
        }
        
        // If we got new final text, add to buffer
        if (finalText.trim()) {
          transcriptBufferRef.current = finalText.trim();
          const fullText = transcriptBufferRef.current;
          setInterimText(fullText);
          onInterimTranscript?.(fullText);
          console.log('[Voice] Buffer updated:', fullText);
        }
        
        // Show interim text for live feedback
        if (currentInterim) {
          const preview = transcriptBufferRef.current 
            ? transcriptBufferRef.current + ' ' + currentInterim
            : currentInterim;
          setInterimText(preview);
          onInterimTranscript?.(preview);
        }
        
        // Reset silence timer — user is still talking
        resetSilenceTimer();
      } else {
        // In manual mode: single result, put in input
        const transcript = event.results[0][0].transcript;
        console.log('[Voice] Transcript:', transcript);
        onTranscript?.(transcript);
        
        if (autoSend && onAutoSend && transcript.trim().length >= 2) {
          onAutoSend(transcript.trim());
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('[Voice] Recognition error:', event.error);
      
      // Don't show error for no-speech (common in hands-free mode)
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setIsListening(false);
        toast({
          title: 'Voice Error',
          description: `Speech recognition failed: ${event.error}`,
          variant: 'destructive',
        });
      }
      
      // In continuous mode, restart after a brief pause on no-speech
      if (shouldRestartRef.current && event.error === 'no-speech') {
        restartTimeoutRef.current = setTimeout(() => {
          if (shouldRestartRef.current) {
            startListening(true);
          }
        }, 500);
      }
    };

    recognition.onend = () => {
      console.log('[Voice] Recognition ended');
      
      // In continuous mode, the browser may stop recognition unexpectedly
      // Restart automatically if we should still be listening
      if (shouldRestartRef.current) {
        // Flush buffer if there's accumulated text and silence timer isn't running
        if (transcriptBufferRef.current.trim() && !silenceTimerRef.current) {
          flushBuffer();
        }
        
        // Auto-restart after a brief pause
        restartTimeoutRef.current = setTimeout(() => {
          if (shouldRestartRef.current) {
            console.log('[Voice] Auto-restarting continuous listening');
            startListening(true);
          }
        }, 300);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscript, autoSend, onAutoSend, onInterimTranscript, toast, resetSilenceTimer, flushBuffer]);

  // Restart listening (used after LJ finishes speaking in hands-free mode)
  const restartListening = useCallback(() => {
    if (shouldRestartRef.current) {
      clearRestartTimeout();
      restartTimeoutRef.current = setTimeout(() => {
        if (shouldRestartRef.current && !isSpeaking) {
          startListening(true);
        }
      }, 300);
    }
  }, [startListening, isSpeaking, clearRestartTimeout]);

  // Text-to-speech using ElevenLabs
  const speak = useCallback(async (text: string, onEnd?: () => void) => {
    if (!text || isSpeaking) return;

    // Stop listening while LJ speaks to prevent feedback
    if (recognitionRef.current && shouldRestartRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
    }

    setIsProcessing(true);
    try {
      console.log('[Voice] Requesting TTS for:', text.substring(0, 50) + '...');
      
      const { data, error } = await supabase.functions.invoke('elevenlabs-tts', {
        body: { text, voiceId },
      });

      if (error) throw error;
      if (!data?.audioContent) throw new Error('No audio content received');

      // Create audio element and play
      const audioSrc = `data:audio/mpeg;base64,${data.audioContent}`;
      
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioSrc);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsSpeaking(true);
        setIsProcessing(false);
        console.log('[Voice] Started speaking');
      };

      audio.onended = () => {
        setIsSpeaking(false);
        console.log('[Voice] Finished speaking');
        onEnd?.();
      };

      audio.onerror = (e) => {
        console.error('[Voice] Audio playback error:', e);
        setIsSpeaking(false);
        setIsProcessing(false);
        onEnd?.();
      };

      await audio.play();
    } catch (error: any) {
      console.error('[Voice] TTS error:', error);
      setIsProcessing(false);
      onEnd?.();
      toast({
        title: 'Voice Error',
        description: error.message || 'Failed to generate speech',
        variant: 'destructive',
      });
    }
  }, [voiceId, isSpeaking, toast]);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
    }
  }, []);

  // Check if browser supports speech recognition
  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  return {
    isListening,
    isSpeaking,
    isProcessing,
    isSupported,
    interimText,
    startListening,
    stopListening,
    restartListening,
    speak,
    stopSpeaking,
  };
};
