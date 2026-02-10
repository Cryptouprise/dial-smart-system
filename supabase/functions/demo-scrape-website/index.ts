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

    // Scrape website with Firecrawl
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

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const metadata = scrapeData.data?.metadata || scrapeData.metadata || {};

    console.log('✅ Scraped content length:', markdown.length);

    // Use Lovable AI to extract business info
    let businessInfo = {
      business_name: metadata.title || 'Unknown Business',
      products_services: 'products and services',
      target_audience: 'businesses',
      value_props: [],
    };

    if (lovableApiKey && markdown.length > 100) {
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
                content: `You are an expert at analyzing business websites. Extract key business information from the website content.
                
Return a JSON object with these fields:
- business_name: The company/business name
- products_services: A brief description of what they offer (1-2 sentences, be specific)
- target_audience: Who their customers are
- value_props: Array of 2-3 key value propositions

Be concise and accurate. If something is unclear, make a reasonable inference.`
              },
              {
                role: 'user',
                content: `Analyze this website content and extract business info:\n\n${markdown.substring(0, 8000)}`
              }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 500,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content;
          if (content) {
            try {
              const parsed = JSON.parse(content);
              businessInfo = {
                business_name: parsed.business_name || businessInfo.business_name,
                products_services: parsed.products_services || businessInfo.products_services,
                target_audience: parsed.target_audience || businessInfo.target_audience,
                value_props: parsed.value_props || businessInfo.value_props,
              };
              console.log('✅ AI extracted:', businessInfo.business_name);
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
