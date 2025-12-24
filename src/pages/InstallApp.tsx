import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Download, Share, Plus, MoreVertical, Check, ArrowRight, Apple, Chrome } from 'lucide-react';
import Navigation from '@/components/Navigation';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallApp = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const features = [
    { icon: '📞', title: 'Instant Access', description: 'Launch the app directly from your home screen' },
    { icon: '🔔', title: 'Push Notifications', description: 'Get notified about important calls and leads' },
    { icon: '⚡', title: 'Faster Loading', description: 'App loads instantly without browser overhead' },
    { icon: '📱', title: 'Full Screen', description: 'Use the full screen without browser UI' },
    { icon: '🔒', title: 'Offline Support', description: 'Access key features even without internet' },
    { icon: '🎯', title: 'Native Feel', description: 'Feels just like a native mobile app' },
  ];

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="max-w-2xl mx-auto px-4 py-12">
          <Card className="border-green-500/20 bg-green-500/5">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <CardTitle className="text-2xl">App Installed!</CardTitle>
              <CardDescription>
                AI Dial Boss is now installed on your device. You can access it from your home screen.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button asChild>
                <a href="/">Go to Dashboard</a>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-8 pb-24">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
            <Smartphone className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Install AI Dial Boss
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Add our app to your home screen for the best mobile experience
          </p>
        </div>

        {/* Quick Install Button (Android Chrome) */}
        {deferredPrompt && (
          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
              <div className="flex items-center gap-3">
                <Download className="h-6 w-6 text-primary" />
                <div>
                  <p className="font-semibold">Ready to Install</p>
                  <p className="text-sm text-muted-foreground">Tap to add to your home screen</p>
                </div>
              </div>
              <Button size="lg" onClick={handleInstallClick} className="w-full sm:w-auto">
                <Download className="mr-2 h-4 w-4" />
                Install Now
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Platform-Specific Instructions */}
        <div className="grid gap-6 md:grid-cols-2 mb-12">
          {/* iOS Instructions */}
          <Card className={isIOS ? 'ring-2 ring-primary' : ''}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Apple className="h-5 w-5" />
                <CardTitle className="text-lg">iPhone / iPad</CardTitle>
                {isIOS && <Badge variant="secondary">Your Device</Badge>}
              </div>
              <CardDescription>Safari browser required</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium shrink-0">1</div>
                <div>
                  <p className="font-medium">Tap the Share button</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    Look for <Share className="h-4 w-4" /> at the bottom of Safari
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium shrink-0">2</div>
                <div>
                  <p className="font-medium">Scroll and tap "Add to Home Screen"</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    Look for <Plus className="h-4 w-4" /> Add to Home Screen
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium shrink-0">3</div>
                <div>
                  <p className="font-medium">Tap "Add" to confirm</p>
                  <p className="text-sm text-muted-foreground">The app will appear on your home screen</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Android Instructions */}
          <Card className={isAndroid && !deferredPrompt ? 'ring-2 ring-primary' : ''}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Chrome className="h-5 w-5" />
                <CardTitle className="text-lg">Android</CardTitle>
                {isAndroid && <Badge variant="secondary">Your Device</Badge>}
              </div>
              <CardDescription>Chrome browser recommended</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium shrink-0">1</div>
                <div>
                  <p className="font-medium">Tap the menu button</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    Look for <MoreVertical className="h-4 w-4" /> at the top right of Chrome
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium shrink-0">2</div>
                <div>
                  <p className="font-medium">Tap "Install app" or "Add to Home screen"</p>
                  <p className="text-sm text-muted-foreground">This option may also appear as a banner</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium shrink-0">3</div>
                <div>
                  <p className="font-medium">Tap "Install" to confirm</p>
                  <p className="text-sm text-muted-foreground">The app will appear on your home screen</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features Grid */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-center mb-8">Why Install?</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="bg-muted/30">
                <CardContent className="flex items-start gap-3 p-4">
                  <span className="text-2xl">{feature.icon}</span>
                  <div>
                    <p className="font-medium">{feature.title}</p>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Back to App */}
        <div className="text-center">
          <Button variant="outline" asChild>
            <a href="/" className="inline-flex items-center gap-2">
              Continue in Browser
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default InstallApp;