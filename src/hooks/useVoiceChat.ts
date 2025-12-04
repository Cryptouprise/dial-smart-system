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
}

export const useVoiceChat = (options: UseVoiceChatOptions = {}) => {
  const { voiceId = 'EXAVITQu4vr4xnSDxMaL', onTranscript } = options;
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  // Initialize speech recognition
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'Voice not supported',
        description: 'Your browser does not support speech recognition.',
        variant: 'destructive',
      });
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      console.log('[Voice] Started listening');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log('[Voice] Transcript:', transcript);
      onTranscript?.(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error('[Voice] Recognition error:', event.error);
      setIsListening(false);
      if (event.error !== 'no-speech') {
        toast({
          title: 'Voice Error',
          description: `Speech recognition failed: ${event.error}`,
          variant: 'destructive',
        });
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log('[Voice] Stopped listening');
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscript, toast]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  // Text-to-speech using ElevenLabs
  const speak = useCallback(async (text: string) => {
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
      };

      audio.onerror = (e) => {
        console.error('[Voice] Audio playback error:', e);
        setIsSpeaking(false);
        setIsProcessing(false);
      };

      await audio.play();
    } catch (error: any) {
      console.error('[Voice] TTS error:', error);
      setIsProcessing(false);
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

  return {
    isListening,
    isSpeaking,
    isProcessing,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
};
