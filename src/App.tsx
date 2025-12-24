
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
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import ApiKeys from "./pages/ApiKeys";
import HelpPage from "./pages/HelpPage";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import AiSmsConversations from "./components/AiSmsConversations";
import AIBrainChat from "./components/AIBrainChat";
import AIAssistantChat from "./components/AIAssistantChat";
import NumberWebhooks from "./pages/NumberWebhooks";
import InstallApp from "./pages/InstallApp";
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
                    <AIBrainProvider>
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
                        
                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                      {/* Mobile Navigation */}
                      <MobileBottomNav />
                      {/* Install Banner for first-time mobile visitors */}
                      <InstallBanner />
                      {/* Global AI Assistants - available on all pages */}
                      <AIBrainChat />
                      <AIAssistantChat />
                    </AIBrainProvider>
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
