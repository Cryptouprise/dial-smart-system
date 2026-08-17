import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const IP_DAILY_LIMIT = 8;
const MAX_HOMEPAGE_CHARS = 9000;
const MAX_ADDITIONAL_PAGES = 6;
const MAX_PAGE_CHARS = 2500;
const MAX_KNOWLEDGE_CHARS = 6500;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function cleanBusinessName(name: string): string {
  return name
    .replace(/^(home|welcome|homepage)\s*[-–—|:]\s*/i, '')
    .replace(/\s*[-–—|:]\s*(home|homepage|welcome|main)$/i, '')
    .replace(/^welcome\s+to\s+/i, '')
    .trim() || name.trim();
}

function cleanWebsiteText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/[`*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferFallbackInfo(metadata: Record<string, any>, fullContent: string) {
  const cleanContent = cleanWebsiteText(fullContent);
  const title = cleanBusinessName(String(metadata?.title || 'Unknown Business'));
  const description = cleanWebsiteText(String(metadata?.description || ''));
  const legalSignals = /\b(attorney|lawyer|law firm|legal representation|practice areas?|personal injury|litigation|case results?)\b/i.test(cleanContent);
  const serviceText = description || cleanContent.slice(0, 650) || `Information and services offered by ${title}.`;

  const sentences = cleanContent
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 260);

  const valueProps = Array.from(new Set(sentences.slice(0, 8)))
    .slice(0, 3)
    .map((sentence) => sentence.replace(/\s+/g, ' '));

  const knowledge = cleanContent.slice(0, MAX_KNOWLEDGE_CHARS);

  return {
    business_name: title,
    products_services: serviceText.slice(0, 900),
    target_audience: legalSignals
      ? 'People seeking legal information, representation, consultations, or help with matters handled by the firm.'
      : 'Prospective customers or clients interested in the products and services described on the website.',
    value_props: valueProps,
    knowledge_base: knowledge,
    personalization_mode: 'website_content_fallback',
  };
}

function normalizePublicUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  const candidate = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === '::1'
    ) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const { url, sessionId } = await req.json();
    const formattedUrl = normalizePublicUrl(url);
    if (!formattedUrl) return json({ success: false, error: 'Please enter a valid public website URL.' }, 400);

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!firecrawlApiKey || !supabaseUrl || !supabaseServiceKey) {
      return json({ success: false, error: 'Website personalization is not configured.' }, 503);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const userAgent = req.headers.get('user-agent') || '';

    if (!sessionId) {
      const startOfDay = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
      const { count } = await supabase
        .from('demo_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', clientIp)
        .gte('created_at', startOfDay);
      if ((count || 0) >= IP_DAILY_LIMIT) {
        return json({
          success: false,
          limitReached: true,
          error: 'Website demo limit reached for today. Contact us for another personalized demo.',
        }, 429);
      }
    }

    console.log('demo-scrape: scraping', formattedUrl);
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: formattedUrl, formats: ['markdown'], onlyMainContent: true }),
    });
    const scrapeData = await scrapeResponse.json();
    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error('demo-scrape: Firecrawl error', scrapeData?.error || scrapeResponse.status);
      return json({ success: false, error: scrapeData?.error || 'Failed to analyze this website.' }, 400);
    }

    const homepageMarkdown = String(scrapeData.data?.markdown || scrapeData.markdown || '').slice(0, MAX_HOMEPAGE_CHARS);
    const metadata = (scrapeData.data?.metadata || scrapeData.metadata || {}) as Record<string, any>;
    if (homepageMarkdown.length < 80) {
      return json({ success: false, error: 'We could not read enough public content from this website. Try another page or website.' }, 422);
    }

    let additionalContent = '';
    try {
      const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: { Authorization: `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: formattedUrl, limit: 80, includeSubdomains: false }),
      });
      const mapData = await mapResponse.json();
      const links: string[] = mapResponse.ok && mapData.success && Array.isArray(mapData.links) ? mapData.links : [];
      const patterns = [
        /about/i, /team/i, /staff/i, /attorney/i, /lawyer/i, /people/i, /our-story/i,
        /services/i, /practice/i, /what-we-do/i, /solutions/i, /products/i, /offerings/i,
        /contact/i, /location/i, /hours/i, /schedule/i, /consult/i,
        /faq/i, /questions/i, /pricing/i, /rates/i, /plans/i,
        /testimonial/i, /review/i, /clients/i, /case-results/i, /results/i, /why-choose/i,
      ];
      const keyPages = links
        .filter((link) => {
          try {
            const parsed = new URL(link);
            if (parsed.origin !== new URL(formattedUrl).origin) return false;
            const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
            if (!path || path === '/' || parsed.hash) return false;
            return patterns.some((pattern) => pattern.test(path));
          } catch {
            return false;
          }
        })
        .slice(0, MAX_ADDITIONAL_PAGES);

      const pages = await Promise.all(keyPages.map(async (pageUrl) => {
        try {
          const pageResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: { Authorization: `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: pageUrl, formats: ['markdown'], onlyMainContent: true }),
          });
          const pageData = await pageResponse.json();
          if (!pageResponse.ok || !pageData.success) return '';
          const content = String(pageData.data?.markdown || pageData.markdown || '').slice(0, MAX_PAGE_CHARS);
          return `\n\n--- ${new URL(pageUrl).pathname} ---\n${content}`;
        } catch {
          return '';
        }
      }));
      additionalContent = pages.join('');
    } catch (error) {
      console.warn('demo-scrape: site map enrichment skipped', (error as Error).message);
    }

    const fullContent = `${homepageMarkdown}${additionalContent}`;
    let businessInfo: Record<string, any> = inferFallbackInfo(metadata, fullContent);

    if (lovableApiKey && fullContent.length > 100) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            messages: [
              {
                role: 'system',
                content: `Analyze a business website for an AI phone demo. Return only JSON with business_name, products_services, target_audience, value_props (2-4 strings), and knowledge_base. The knowledge_base should be a factual 300-600 word briefing using only supplied website content. Include offerings/practice areas, locations/service areas, hours if present, team/leadership if present, differentiators, contact details, FAQs, and credentials when available. Never invent facts.`,
              },
              {
                role: 'user',
                content: `Website: ${formattedUrl}\n\n${fullContent.slice(0, 18000)}`,
              },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 1800,
          }),
        });

        if (!aiResponse.ok) {
          console.warn('demo-scrape: AI enrichment HTTP', aiResponse.status);
        } else {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            const aiKnowledge = String(parsed.knowledge_base || '').trim();
            const aiServices = String(parsed.products_services || '').trim();
            if (aiKnowledge.length >= 150 && aiServices.length >= 30) {
              businessInfo = {
                business_name: cleanBusinessName(String(parsed.business_name || businessInfo.business_name)),
                products_services: aiServices.slice(0, 1200),
                target_audience: String(parsed.target_audience || businessInfo.target_audience).slice(0, 1000),
                value_props: Array.isArray(parsed.value_props) ? parsed.value_props.slice(0, 4).map((v: unknown) => String(v).slice(0, 400)) : businessInfo.value_props,
                knowledge_base: aiKnowledge.slice(0, MAX_KNOWLEDGE_CHARS),
                personalization_mode: 'ai_enriched',
              };
            }
          }
        }
      } catch (error) {
        console.warn('demo-scrape: AI enrichment fallback used', (error as Error).message);
      }
    }

    if (!businessInfo.knowledge_base || String(businessInfo.knowledge_base).length < 100) {
      return json({ success: false, error: 'We could not build enough business context from this website. Try another page or contact us for a guided demo.' }, 422);
    }

    let session;
    if (sessionId) {
      const { data, error } = await supabase
        .from('demo_sessions')
        .update({ website_url: formattedUrl, scraped_data: businessInfo, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select()
        .single();
      if (error || !data) return json({ success: false, error: 'Failed to update demo session.' }, 500);
      session = data;
    } else {
      const { data, error } = await supabase
        .from('demo_sessions')
        .insert({ website_url: formattedUrl, scraped_data: businessInfo, ip_address: clientIp, user_agent: userAgent })
        .select()
        .single();
      if (error || !data) return json({ success: false, error: 'Failed to create demo session.' }, 500);
      session = data;
    }

    return json({
      success: true,
      sessionId: session.id,
      data: businessInfo,
      metadata: {
        title: metadata.title,
        description: metadata.description,
        sourceURL: formattedUrl,
        personalizationMode: businessInfo.personalization_mode,
      },
    });
  } catch (error) {
    console.error('demo-scrape: unexpected error', (error as Error).message);
    return json({ success: false, error: 'Unable to personalize this demo right now.' }, 500);
  }
});
