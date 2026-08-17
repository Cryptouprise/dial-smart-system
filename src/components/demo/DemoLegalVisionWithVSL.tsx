import { useEffect, useRef } from 'react';
import { DemoLegalVision } from './DemoLegalVision';
import type { LegalInboundConfig } from './DemoLegalInboundSetup';
import { trackDemoFunnelEvent } from '@/lib/demoFunnelAnalytics';

interface DemoLegalVisionWithVSLProps {
  businessName?: string;
  websiteUrl: string;
  sessionId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  legalInboundConfig: LegalInboundConfig;
  retellCallId: string | null;
  onStartOver: () => void;
}

const VSL_SEGMENTS = [
  'https://d8j0ntlcm91z4.cloudfront.net/user_3GuOTPw77h05YRcKC2ACkrQRXog/hf_20260817_000919_2ab8c0b4-87ff-4bdf-ae19-0ad664643ad8.mp4',
  'https://d8j0ntlcm91z4.cloudfront.net/user_3GuOTPw77h05YRcKC2ACkrQRXog/hf_20260817_010925_3c5e93ce-cb0f-4c93-b754-74bad263777f.mp4',
  'https://d8j0ntlcm91z4.cloudfront.net/user_3GuOTPw77h05YRcKC2ACkrQRXog/hf_20260817_010934_52d8e522-7450-4161-b4a6-84e45d338292.mp4',
  'https://d8j0ntlcm91z4.cloudfront.net/user_3GuOTPw77h05YRcKC2ACkrQRXog/hf_20260817_010941_5901ae59-9478-4828-b3f2-16bef58a4893.mp4',
];

export const DemoLegalVisionWithVSL = (props: DemoLegalVisionWithVSLProps) => {
  const startedRef = useRef(false);
  const segmentRef = useRef(0);

  useEffect(() => {
    let video: HTMLVideoElement | null = null;
    let observer: MutationObserver | null = null;

    const attach = () => {
      video = document.querySelector<HTMLVideoElement>('video[src="/videos/law-firm-beta-vsl.mp4"]');
      if (!video) return false;

      video.src = VSL_SEGMENTS[0];
      video.muted = true;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      segmentRef.current = 0;

      const onPlay = () => {
        if (startedRef.current) return;
        startedRef.current = true;
        void trackDemoFunnelEvent({
          eventName: 'legal_vsl_started',
          sessionId: props.sessionId,
          metadata: { progress_percent: 0, video_segment: 1 },
        });
      };

      const onEnded = () => {
        const completedSegment = segmentRef.current + 1;
        const progress = completedSegment * 25;
        void trackDemoFunnelEvent({
          eventName: progress >= 100 ? 'legal_vsl_completed' : 'legal_vsl_started',
          sessionId: props.sessionId,
          metadata: { progress_percent: progress, video_segment: completedSegment },
        });

        if (completedSegment >= VSL_SEGMENTS.length) return;

        segmentRef.current += 1;
        if (!video) return;
        const wasMuted = video.muted;
        video.src = VSL_SEGMENTS[segmentRef.current];
        video.muted = wasMuted;
        video.load();
        video.play().catch(() => {
          // Browser autoplay policies may require the user to press play again.
        });
      };

      video.addEventListener('play', onPlay);
      video.addEventListener('ended', onEnded);

      const cleanupVideo = () => {
        video?.removeEventListener('play', onPlay);
        video?.removeEventListener('ended', onEnded);
      };
      (video as any).__callBossVslCleanup = cleanupVideo;
      return true;
    };

    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) {
          observer?.disconnect();
          observer = null;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      if (video && (video as any).__callBossVslCleanup) {
        (video as any).__callBossVslCleanup();
      }
    };
  }, [props.sessionId]);

  return <DemoLegalVision {...props} />;
};
