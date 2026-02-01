import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Phone, PhoneOff, Mic, Volume2, Loader2 } from 'lucide-react';

interface DemoCallInProgressProps {
  callId: string | null;
  scrapedData: any;
  onCallComplete: () => void;
  onSkip: () => void;
}

export const DemoCallInProgress = ({
  callId,
  scrapedData,
  onCallComplete,
  onSkip,
}: DemoCallInProgressProps) => {
  const [status, setStatus] = useState<'ringing' | 'connected' | 'ended'>('ringing');
  const [duration, setDuration] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(new Array(12).fill(0.2));

  // Simulate call progression
  useEffect(() => {
    const timeout1 = setTimeout(() => setStatus('connected'), 3000);
    const timeout2 = setTimeout(() => {
      setStatus('ended');
      setTimeout(onCallComplete, 2000);
    }, 45000); // 45 second demo call

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };
  }, [onCallComplete]);

  // Duration counter
  useEffect(() => {
    if (status !== 'connected') return;
    const interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Waveform animation
  useEffect(() => {
    if (status !== 'connected') return;
    const interval = setInterval(() => {
      setWaveformBars(bars => bars.map(() => 0.2 + Math.random() * 0.8));
    }, 150);
    return () => clearInterval(interval);
  }, [status]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-primary/5">
      <div className="w-full max-w-md space-y-6">
        {/* iPhone Mockup */}
        <div className="relative mx-auto" style={{ maxWidth: 300 }}>
          {/* Phone Frame */}
          <div className="bg-black rounded-[3rem] p-3 shadow-2xl">
            <div className="bg-black rounded-[2.5rem] overflow-hidden">
              {/* Notch */}
              <div className="bg-black h-8 flex justify-center items-center">
                <div className="bg-black w-24 h-6 rounded-b-2xl" />
              </div>
              
              {/* Screen */}
              <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 aspect-[9/16] flex flex-col items-center justify-center p-6">
                {/* Status */}
                {status === 'ringing' && (
                  <div className="text-center space-y-4 animate-pulse">
                    <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                      <Phone className="h-12 w-12 text-green-500 animate-bounce" />
                    </div>
                    <div>
                      <p className="text-lg font-medium text-white">Incoming Call</p>
                      <p className="text-green-400">Call Boss AI</p>
                    </div>
                  </div>
                )}

                {status === 'connected' && (
                  <div className="text-center space-y-6 w-full">
                    <div className="space-y-2">
                      <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                        <Volume2 className="h-10 w-10 text-primary" />
                      </div>
                      <p className="text-lg font-medium text-white">Connected</p>
                      <p className="text-2xl font-mono text-green-400">{formatDuration(duration)}</p>
                    </div>

                    {/* Waveform */}
                    <div className="flex items-center justify-center gap-1 h-12">
                      {waveformBars.map((height, i) => (
                        <div
                          key={i}
                          className="w-1.5 bg-primary rounded-full transition-all duration-100"
                          style={{ height: `${height * 100}%` }}
                        />
                      ))}
                    </div>

                    {/* Business info */}
                    <div className="text-sm text-zinc-400">
                      <p>Calling about</p>
                      <p className="text-white font-medium">{scrapedData?.business_name}</p>
                    </div>
                  </div>
                )}

                {status === 'ended' && (
                  <div className="text-center space-y-4">
                    <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mx-auto">
                      <PhoneOff className="h-10 w-10 text-zinc-500" />
                    </div>
                    <div>
                      <p className="text-lg font-medium text-white">Call Ended</p>
                      <p className="text-zinc-400">{formatDuration(duration)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Home indicator */}
              <div className="bg-black h-8 flex justify-center items-center">
                <div className="bg-zinc-600 w-32 h-1 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="text-center space-y-3">
          {status === 'connected' && (
            <p className="text-sm text-muted-foreground">
              Listen to how our AI handles a real sales conversation...
            </p>
          )}
          
          {status === 'ended' && (
            <div className="flex items-center justify-center gap-2 text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading campaign simulation...</span>
            </div>
          )}

          <Button variant="outline" onClick={onSkip}>
            Skip to Simulation
          </Button>
        </div>
      </div>
    </div>
  );
};
