import React, { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "next-themes";
import { SimpleModeProvider } from "@/contexts/SimpleModeContext";
import { AIErrorProvider } from "@/contexts/AIErrorContext";
import { AIBrainProvider } from "@/contexts/AIBrainContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { Skeleton } from "@/components/ui/skeleton";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const LegalBeta = lazy(() => import("./pages/LegalBeta"));
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Demo = lazy(() => import("./pages/Demo"));
const Settings = lazy(() => import("./pages/Settings"));
const ApiKeys = lazy(() => import("./pages/ApiKeys"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const Analytics = lazy(() => import("./pages/Analytics"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AiSmsConversations = lazy(() => import("./components/AiSmsConversations"));
const NumberWebhooks = lazy(() => import("./pages/NumberWebhooks"));
const InstallApp = lazy(() => import("./pages/InstallApp"));
const SystemTestingHub = lazy(() => import("./pages/SystemTestingHub"));
const McpConsent = lazy(() => import("./pages/McpConsent"));
const AgentConnect = lazy(() => import("./pages/AgentConnect"));

import AIAssistantChat from "./components/AIAssistantChat";
import MobileBottomNav from "./components/MobileBottomNav";
import InstallBanner from "./components/InstallBanner";
import { LegalBetaAnnouncement } from "./components/LegalBetaAnnouncement";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="space-y-4 w-full max-w-md px-4">
      <Skeleton className="h-8 w-3/4 mx-auto" />
      <Skeleton className="h-4 w-1/2 mx-auto" />
      <div className="grid grid-cols-2 gap-4 mt-8">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  </div>
);

const ShowcaseRouteBridge = () => {
  React.useEffect(() => {
    const { pathname, search, hash } = window.location;

    if (pathname === "/showcase" || pathname === "/showcase/") {
      window.location.replace("/showcase/index.html");
      return;
    }

    if (pathname.startsWith("/showcase/") && pathname.endsWith(".html")) {
      window.location.replace(`${pathname}${search}${hash}`);
      return;
    }

    window.location.replace("/showcase/index.html");
  }, []);

  return <PageLoader />;
};

const PUBLIC_SHELL_PREFIXES = [
  '/',
  '/auth',
  '/demo',
  '/law-firms',
  '/legal-beta',
  '/showcase',
  '/.lovable/oauth/consent',
];

const PublicAwareAppChrome = () => {
  const { pathname } = useLocation();
  const isPublic = PUBLIC_SHELL_PREFIXES.some((route) =>
    route === '/'
      ? pathname === '/'
      : pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isPublic) return null;

  return (
    <>
      <MobileBottomNav />
      <InstallBanner />
      <AIAssistantChat />
    </>
  );
};

const App = () => (
  <GlobalErrorBoundary>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <DemoModeProvider>
            <SimpleModeProvider>
              <AIErrorProvider>
                <TooltipProvider>
                  <Toaster />
                  <Sonner />
                  <BrowserRouter>
                    <AuthProvider>
                      <OrganizationProvider>
                        <AIBrainProvider>
                          <Suspense fallback={<PageLoader />}>
                            <Routes>
                              <Route path="/" element={<><LandingPage /><LegalBetaAnnouncement /></>} />
                              <Route path="/law-firms" element={<LegalBeta />} />
                              <Route path="/legal-beta" element={<LegalBeta />} />
                              <Route path="/auth" element={<Auth />} />
                              <Route path="/demo" element={<Demo />} />
                              <Route path="/.lovable/oauth/consent" element={<McpConsent />} />
                              <Route path="/showcase/*" element={<ShowcaseRouteBridge />} />

                              <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                              <Route path="/sms-conversations" element={<ProtectedRoute><AiSmsConversations /></ProtectedRoute>} />
                              <Route path="/number-webhooks" element={<ProtectedRoute><NumberWebhooks /></ProtectedRoute>} />
                              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                              <Route path="/api-keys" element={<ProtectedRoute><ApiKeys /></ProtectedRoute>} />
                              <Route path="/help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
                              <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                              <Route path="/install" element={<ProtectedRoute><InstallApp /></ProtectedRoute>} />
                              <Route path="/system-testing" element={<ProtectedRoute><SystemTestingHub /></ProtectedRoute>} />
                              <Route path="/connect" element={<ProtectedRoute><AgentConnect /></ProtectedRoute>} />

                              <Route path="*" element={<NotFound />} />
                            </Routes>
                          </Suspense>
                          <PublicAwareAppChrome />
                        </AIBrainProvider>
                      </OrganizationProvider>
                    </AuthProvider>
                  </BrowserRouter>
                </TooltipProvider>
              </AIErrorProvider>
            </SimpleModeProvider>
          </DemoModeProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </GlobalErrorBoundary>
);

export default App;
