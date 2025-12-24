import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SimpleModeProvider } from "@/contexts/SimpleModeContext";
import { AIErrorProvider } from "@/contexts/AIErrorContext";
import { AIBrainProvider } from "@/contexts/AIBrainContext";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
<<<<<<< HEAD
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import MobileBottomNav from "./components/MobileBottomNav";
import InstallBanner from "./components/InstallBanner";

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
const NumberWebhooks = lazy(() => import("./pages/NumberWebhooks"));
const InstallApp = lazy(() => import("./pages/InstallApp"));
=======
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import ApiKeys from "./pages/ApiKeys";
import HelpPage from "./pages/HelpPage";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import AiSmsConversations from "./components/AiSmsConversations";
import AIBrainChat from "./components/AIBrainChat";
import NumberWebhooks from "./pages/NumberWebhooks";
import InstallApp from "./pages/InstallApp";
import MobileBottomNav from "./components/MobileBottomNav";
import InstallBanner from "./components/InstallBanner";
>>>>>>> 991030405d66e3302fdbd96e4d3f577011c4dab0

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
      <DemoModeProvider>
        <SimpleModeProvider>
          <AIErrorProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
<<<<<<< HEAD
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
                      <Route path="/install" element={<InstallApp />} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                  {/* Mobile Navigation */}
                  <MobileBottomNav />
                  {/* Install Banner for first-time mobile visitors */}
                  <InstallBanner />
                  {/* Global AI Assistant - available on all pages */}
                  <Suspense fallback={null}>
                    <AIBrainChat />
                  </Suspense>
                </AIBrainProvider>
              </BrowserRouter>
            </TooltipProvider>
          </AIErrorProvider>
        </SimpleModeProvider>
      </DemoModeProvider>
=======
              <AIBrainProvider>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/sms-conversations" element={<AiSmsConversations />} />
                  <Route path="/number-webhooks" element={<NumberWebhooks />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/api-keys" element={<ApiKeys />} />
                  <Route path="/help" element={<HelpPage />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/install" element={<InstallApp />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                {/* Mobile Navigation */}
                <MobileBottomNav />
                {/* Install Banner for first-time mobile visitors */}
                <InstallBanner />
                {/* Global AI Assistant - available on all pages */}
                <AIBrainChat />
              </AIBrainProvider>
            </BrowserRouter>
          </TooltipProvider>
        </AIErrorProvider>
      </SimpleModeProvider>
    </DemoModeProvider>
>>>>>>> 991030405d66e3302fdbd96e4d3f577011c4dab0
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
