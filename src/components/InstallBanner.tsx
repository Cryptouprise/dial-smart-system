import { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallBanner = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    // Check if user dismissed before
    const dismissed = localStorage.getItem('install-banner-dismissed');
    if (dismissed) {
      const dismissedTime = new Date(dismissed).getTime();
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      // Show again after 7 days
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // Delay showing banner for better UX
    const timer = setTimeout(() => {
      setShowBanner(true);
    }, 5000);

    // Listen for install prompt (Chrome/Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('install-banner-dismissed', new Date().toISOString());
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <Smartphone className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Install AI Dial Boss</p>
            <p className="text-xs opacity-90 mt-1">
              Add to your home screen for quick access and offline support
            </p>
            <div className="flex items-center gap-2 mt-3">
              {deferredPrompt ? (
                <Button 
                  size="sm" 
                  variant="secondary" 
                  onClick={handleInstall}
                  className="h-8 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Install
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  variant="secondary" 
                  asChild
                  className="h-8 text-xs"
                >
                  <Link to="/install">
                    Learn How
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallBanner;