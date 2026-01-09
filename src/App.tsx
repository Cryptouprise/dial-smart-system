import React, { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

// Lazy load all route components for faster initial load
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Settings = lazy(() => import("./pages/Settings"));
const ApiKeys = lazy(() => import("./pages/ApiKeys"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const Analytics = lazy(() => import("./pages/Analytics"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AiSmsConversations = lazy(() => import("./components/AiSmsConversations"));
const NumberWebhooks = lazy(() => import("./pages/NumberWebhooks"));
const InstallApp = lazy(() => import("./pages/InstallApp"));
const SystemTestingHub = lazy(() => import("./pages/SystemTestingHub"));

// Non-lazy loaded global components (needed immediately)
import AIAssistantChat from "./components/AIAssistantChat";
import MobileBottomNav from "./components/MobileBottomNav";
import InstallBanner from "./components/InstallBanner";

// Configure React Query with better defaults for scalability
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

// Loading fallback for lazy-loaded routes
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

const App = () => (
  <GlobalErrorBoundary>
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
                            {/* Public route */}
                            <Route path="/auth" element={<Auth />} />
                            
                            {/* Protected routes */}
                            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                            <Route path="/sms-conversations" element={<ProtectedRoute><AiSmsConversations /></ProtectedRoute>} />
                            <Route path="/number-webhooks" element={<ProtectedRoute><NumberWebhooks /></ProtectedRoute>} />
                            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                            <Route path="/api-keys" element={<ProtectedRoute><ApiKeys /></ProtectedRoute>} />
                            <Route path="/help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
                            <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                            <Route path="/install" element={<ProtectedRoute><InstallApp /></ProtectedRoute>} />
                            <Route path="/system-testing" element={<ProtectedRoute><SystemTestingHub /></ProtectedRoute>} />
                            
                            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </Suspense>
                        {/* Mobile Navigation */}
                        <MobileBottomNav />
                        {/* Install Banner for first-time mobile visitors */}
                        <InstallBanner />
                        {/* Global AI Assistant - available on all pages */}
                        <AIAssistantChat />
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
  </GlobalErrorBoundary>
);

export default App;
