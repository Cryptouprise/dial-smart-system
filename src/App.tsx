
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SimpleModeProvider } from "@/contexts/SimpleModeContext";
import { AIErrorProvider } from "@/contexts/AIErrorContext";
import { AIBrainProvider } from "@/contexts/AIBrainContext";
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

const queryClient = new QueryClient();

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
                {/* Global AI Assistants - available on all pages */}
                <AIBrainChat />
                <AIAssistantChat />
              </AIBrainProvider>
            </BrowserRouter>
          </TooltipProvider>
        </AIErrorProvider>
      </SimpleModeProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
