import { supabase } from '@/integrations/supabase/client';

export type DemoFunnelEvent =
  | 'law_firm_landing_view'
  | 'website_submitted'
  | 'scrape_completed'
  | 'scrape_failed'
  | 'legal_setup_viewed'
  | 'legal_setup_completed'
  | 'demo_call_viewed'
  | 'demo_call_initiated'
  | 'demo_call_skipped'
  | 'legal_simulation_viewed'
  | 'legal_simulation_completed'
  | 'legal_roi_viewed'
  | 'legal_vision_viewed'
  | 'legal_vsl_started'
  | 'legal_vsl_completed'
  | 'interest_selected'
  | 'beta_lead_submitted';

const getAttribution = () => {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    utmContent: params.get('utm_content') || undefined,
    utmTerm: params.get('utm_term') || undefined,
  };
};

export const trackDemoFunnelEvent = async ({
  eventName,
  sessionId,
  funnel = 'law_firm_beta',
  source = 'website',
  metadata = {},
}: {
  eventName: DemoFunnelEvent;
  sessionId?: string | null;
  funnel?: string;
  source?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}) => {
  try {
    await supabase.functions.invoke('demo-funnel-track', {
      body: {
        eventName,
        sessionId: sessionId || undefined,
        funnel,
        source,
        metadata,
        ...getAttribution(),
      },
    });
  } catch (error) {
    // Analytics should never block the demo funnel.
    console.warn('Demo funnel analytics event failed:', eventName, error);
  }
};
