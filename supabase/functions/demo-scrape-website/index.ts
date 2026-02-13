import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, sessionId } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('🔍 Scraping URL:', formattedUrl);

    // Step 1: Scrape the homepage
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error('Firecrawl error:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: scrapeData.error || 'Failed to scrape website' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const homepageMarkdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const metadata = scrapeData.data?.metadata || scrapeData.metadata || {};

    console.log('✅ Homepage scraped, length:', homepageMarkdown.length);

    // Step 2: Map the site to discover key pages
    let additionalContent = '';
    try {
      const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: formattedUrl,
          limit: 50,
          includeSubdomains: false,
        }),
      });

      const mapData = await mapResponse.json();

      if (mapResponse.ok && mapData.success && mapData.links) {
        console.log(`🗺️ Found ${mapData.links.length} pages on site`);

        // Filter for high-value pages (about, services, contact, hours, team, FAQ, pricing)
        const keyPagePatterns = [
          /about/i, /team/i, /staff/i, /our-story/i, /history/i, /who-we-are/i,
          /services/i, /what-we-do/i, /solutions/i, /products/i, /offerings/i,
          /contact/i, /location/i, /hours/i, /schedule/i,
          /faq/i, /questions/i,
          /pricing/i, /rates/i, /plans/i,
          /testimonial/i, /review/i, /clients/i,
        ];

        const keyPages = (mapData.links as string[])
          .filter((link: string) => {
            const path = link.replace(formattedUrl, '').toLowerCase();
            // Skip the homepage (already scraped), anchors, and non-page URLs
            if (!path || path === '/' || path.includes('#') || path.includes('?')) return false;
            return keyPagePatterns.some(pattern => pattern.test(path));
          })
          .slice(0, 5); // Max 5 additional pages to keep it fast

        console.log(`📄 Scraping ${keyPages.length} key pages:`, keyPages);

        // Scrape key pages in parallel (batch of up to 5)
        const pagePromises = keyPages.map(async (pageUrl: string) => {
          try {
            const pageResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${firecrawlApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: pageUrl,
                formats: ['markdown'],
                onlyMainContent: true,
              }),
            });

            const pageData = await pageResponse.json();
            if (pageResponse.ok && pageData.success) {
              const content = pageData.data?.markdown || pageData.markdown || '';
              const pageName = pageUrl.replace(formattedUrl, '').replace(/\//g, ' ').trim() || 'page';
              return `\n\n--- ${pageName.toUpperCase()} PAGE ---\n${content.substring(0, 3000)}`;
            }
          } catch (e) {
            console.warn(`Failed to scrape ${pageUrl}:`, e);
          }
          return '';
        });

        const pageResults = await Promise.all(pagePromises);
        additionalContent = pageResults.join('');
        console.log(`✅ Additional content collected: ${additionalContent.length} chars`);
      }
    } catch (e) {
      console.warn('Map/multi-page scrape failed (non-fatal):', e);
    }

    // Step 3: Combine all content into a comprehensive knowledge base
    const fullContent = homepageMarkdown + additionalContent;

    // Step 4: Use AI to extract business info AND build knowledge base
    // Clean common title prefixes like "Home - ", "Home | ", "Welcome to "
    const cleanBusinessName = (name: string): string => {
      return name
        .replace(/^(home|welcome|homepage)\s*[-–—|:]\s*/i, '')
        .replace(/\s*[-–—|:]\s*(home|homepage|welcome|main)$/i, '')
        .replace(/^welcome\s+to\s+/i, '')
        .trim() || name.trim();
    };

    let businessInfo: Record<string, any> = {
      business_name: cleanBusinessName(metadata.title || 'Unknown Business'),
      products_services: 'products and services',
      target_audience: 'businesses',
      value_props: [],
      knowledge_base: '',
    };

    if (lovableApiKey && fullContent.length > 100) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            messages: [
              {
                role: 'system',
                content: `You are an expert at analyzing business websites. Extract comprehensive business information that an AI sales agent would need to answer questions about this company.

Return a JSON object with these fields:
- business_name: The company/business name
- products_services: Brief description of what they offer (1-2 sentences)
- target_audience: Who their customers are
- value_props: Array of 2-3 key value propositions
- knowledge_base: A comprehensive summary (300-500 words) covering ALL of the following that you can find:
  * What the company does and their main offerings/services
  * How long they've been in business / company history
  * Business hours / hours of operation
  * Location(s) and service areas
  * Team size, key team members, or leadership
  * Pricing info or pricing model (if available)
  * What makes them different from competitors
  * Customer testimonials or notable achievements
  * Contact information (phone, email, address)
  * Any certifications, awards, or credentials
  * FAQ answers or common questions

Write the knowledge_base as a natural briefing document that an AI agent can reference when answering questions. If information isn't available, skip it - don't make things up.`
              },
              {
                role: 'user',
                content: `Analyze this website content and extract business info:\n\n${fullContent.substring(0, 15000)}`
              }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 1500,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content;
          if (content) {
            try {
              const parsed = JSON.parse(content);
              businessInfo = {
                business_name: cleanBusinessName(parsed.business_name || businessInfo.business_name),
                products_services: parsed.products_services || businessInfo.products_services,
                target_audience: parsed.target_audience || businessInfo.target_audience,
                value_props: parsed.value_props || businessInfo.value_props,
                knowledge_base: parsed.knowledge_base || '',
              };
              console.log('✅ AI extracted:', businessInfo.business_name, '| KB length:', (businessInfo.knowledge_base as string).length);
            } catch (e) {
              console.error('Failed to parse AI response:', e);
            }
          }
        }
      } catch (e) {
        console.error('AI extraction failed:', e);
      }
    }

    // Get client IP for session tracking
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || '';

    // Create or update demo session
    let session;
    if (sessionId) {
      const { data, error } = await supabase
        .from('demo_sessions')
        .update({
          website_url: formattedUrl,
          scraped_data: businessInfo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        console.error('Session update error:', error);
      }
      session = data;
    } else {
      const { data, error } = await supabase
        .from('demo_sessions')
        .insert({
          website_url: formattedUrl,
          scraped_data: businessInfo,
          ip_address: clientIp,
          user_agent: userAgent,
        })
        .select()
        .single();

      if (error) {
        console.error('Session create error:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create session' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      session = data;
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: session?.id,
        data: businessInfo,
        metadata: {
          title: metadata.title,
          description: metadata.description,
          sourceURL: formattedUrl,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in demo-scrape-website:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
