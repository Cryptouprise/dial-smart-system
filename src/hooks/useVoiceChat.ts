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
  autoSend?: boolean; // New: auto-send transcript immediately
  onAutoSend?: (text: string) => void; // New: callback for auto-sending
}

export const useVoiceChat = (options: UseVoiceChatOptions = {}) => {
  const { 
    voiceId = 'EXAVITQu4vr4xnSDxMaL', 
    onTranscript,
    autoSend = false,
    onAutoSend
  } = options;
  
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldRestartRef = useRef(false);
  const { toast } = useToast();

  // Clear any pending restart
  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  // Stop listening completely
  const stopListening = useCallback(() => {
    clearRestartTimeout();
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, [clearRestartTimeout]);

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

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false; // Always false to get complete utterances
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      console.log('[Voice] Started listening (continuous:', continuous, ')');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log('[Voice] Transcript:', transcript);
      
      // Always call onTranscript if provided
      onTranscript?.(transcript);
      
      // If auto-send enabled and transcript is meaningful, auto-send
      if (autoSend && onAutoSend && transcript.trim().length >= 2) {
        console.log('[Voice] Auto-sending transcript');
        onAutoSend(transcript.trim());
      }
    };

    recognition.onerror = (event) => {
      console.error('[Voice] Recognition error:', event.error);
      setIsListening(false);
      
      // Don't show error for no-speech (common in hands-free mode)
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast({
          title: 'Voice Error',
          description: `Speech recognition failed: ${event.error}`,
          variant: 'destructive',
        });
      }
      
      // In continuous mode, restart after a brief pause
      if (shouldRestartRef.current && event.error === 'no-speech') {
        restartTimeoutRef.current = setTimeout(() => {
          if (shouldRestartRef.current) {
            startListening(true);
          }
        }, 500);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log('[Voice] Stopped listening');
      
      // In continuous mode, restart after speaking finishes
      // (The component handles timing via onSpeakEnd callback)
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscript, autoSend, onAutoSend, toast]);

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
    startListening,
    stopListening,
    restartListening,
    speak,
    stopSpeaking,
  };
};
