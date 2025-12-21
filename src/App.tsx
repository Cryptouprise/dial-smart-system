import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SimpleModeProvider } from "@/contexts/SimpleModeContext";
import { AIErrorProvider } from "@/contexts/AIErrorContext";
import { AIBrainProvider } from "@/contexts/AIBrainContext";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy load pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Settings = lazy(() => import("./pages/Settings"));
const ApiKeys = lazy(() => import("./pages/ApiKeys"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const Analytics = lazy(() => import("./pages/Analytics"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AiSmsConversations = lazy(() => import("./components/AiSmsConversations"));
const AIBrainChat = lazy(() => import("./components/AIBrainChat"));
const AIAssistantChat = lazy(() => import("./components/AIAssistantChat"));
const NumberWebhooks = lazy(() => import("./pages/NumberWebhooks"));

const queryClient = new QueryClient();

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <SimpleModeProvider>
        <AIErrorProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AIBrainProvider>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/sms-conversations" element={<AiSmsConversations />} />
                    <Route path="/number-webhooks" element={<NumberWebhooks />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/api-keys" element={<ApiKeys />} />
                    <Route path="/help" element={<HelpPage />} />
                    <Route path="/analytics" element={<Analytics />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
                {/* Global AI Assistants - available on all pages */}
                <Suspense fallback={null}>
                  <AIBrainChat />
                  <AIAssistantChat />
                </Suspense>
              </AIBrainProvider>
            </BrowserRouter>
          </TooltipProvider>
        </AIErrorProvider>
      </SimpleModeProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
