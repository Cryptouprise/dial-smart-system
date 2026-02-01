import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Loader2, CheckCircle, AlertCircle, Globe, Building, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DemoWebsiteScraperProps {
  websiteUrl: string;
  onComplete: (sessionId: string, data: any) => void;
  onBack: () => void;
}

export const DemoWebsiteScraper = ({ websiteUrl, onComplete, onBack }: DemoWebsiteScraperProps) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Connecting to website...');
  const [scrapedData, setScrapedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const scrapeWebsite = async () => {
      try {
        // Simulate progress stages
        const stages = [
          { progress: 20, message: 'Connecting to website...' },
          { progress: 40, message: 'Scanning page content...' },
          { progress: 60, message: 'Analyzing your business...' },
          { progress: 80, message: 'Extracting key information...' },
        ];

        for (const stage of stages) {
          setProgress(stage.progress);
          setMessage(stage.message);
          await new Promise(r => setTimeout(r, 500));
        }

        const { data, error: fnError } = await supabase.functions.invoke('demo-scrape-website', {
          body: { url: websiteUrl },
        });

        if (fnError || !data?.success) {
          throw new Error(data?.error || fnError?.message || 'Failed to scrape website');
        }

        setProgress(100);
        setMessage('Analysis complete!');
        setScrapedData(data.data);
        setStatus('success');

        // Auto-proceed after showing results
        setTimeout(() => {
          onComplete(data.sessionId, data.data);
        }, 2000);

      } catch (err: any) {
        console.error('Scrape error:', err);
        setStatus('error');
        setError(err.message || 'Failed to analyze website');
      }
    };

    scrapeWebsite();
  }, [websiteUrl, onComplete]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} disabled={status === 'loading'}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <span className="text-sm text-muted-foreground truncate max-w-xs">{websiteUrl}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            {status === 'loading' && (
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-muted">
                  <div 
                    className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">{progress}%</span>
                </div>
              </div>
            )}
            {status === 'success' && (
              <CheckCircle className="h-20 w-20 text-green-500" />
            )}
            {status === 'error' && (
              <AlertCircle className="h-20 w-20 text-destructive" />
            )}
          </div>

          <div className="text-center">
            <p className="text-lg font-medium">{message}</p>
            {status === 'loading' && (
              <p className="text-sm text-muted-foreground mt-1">
                This usually takes 10-15 seconds
              </p>
            )}
          </div>
        </div>

        {/* Results Preview */}
        {status === 'success' && scrapedData && (
          <div className="space-y-3 pt-4 border-t animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <Building className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Business</p>
                <p className="font-medium">{scrapedData.business_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <Package className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Products/Services</p>
                <p className="font-medium">{scrapedData.products_services}</p>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div className="space-y-4 pt-4 border-t">
            <p className="text-sm text-destructive text-center">{error}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onBack} className="flex-1">
                Try Different URL
              </Button>
              <Button onClick={() => window.location.reload()} className="flex-1">
                Retry
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
