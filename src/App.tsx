import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { VideoSDKProvider } from "@/contexts/VideoSDKContext";
import { LiffProvider } from "@/contexts/LiffContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import SetupPage from "./pages/SetupPage";
import PlanetKitMeeting from "./pages/PlanetKitMeeting";
import NotFound from "./pages/NotFound";
import { AgentCallTrigger } from "./pages/AgentCallTrigger";
import { AgentCallMeeting } from "./pages/AgentCallMeeting";
import { ScheduleRetryPage } from "./pages/ScheduleRetryPage";
import { AIAgentCallMeeting } from "./pages/AIAgentCallMeeting";
import { AIAgentBridgeMeeting } from "./pages/AIAgentBridgeMeeting";
import { HeadlessAgentPage } from "./pages/HeadlessAgentPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <LiffProvider>
        <VideoSDKProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
            <Routes>
              {/* Main pages */}
              <Route path="/" element={<SetupPage />} />
              <Route path="/setup" element={<SetupPage />} />

              {/* PlanetKit Conference */}
              <Route path="/planetkit_meeting" element={<PlanetKitMeeting />} />

              {/* Agent Call (1-to-1 outbound voice call) */}
              <Route path="/agent-call" element={<AgentCallTrigger />} />
              <Route path="/agent-call-meeting" element={<AgentCallMeeting />} />
              <Route path="/schedule-retry" element={<ScheduleRetryPage />} />

              {/* AI Agent Call - Direct Gemini Voice Call */}
              <Route path="/ai-agent-call" element={<AIAgentCallMeeting />} />

              {/* AI Agent Bridge - Browser as Bridge to PlanetKit Conference */}
              <Route path="/ai-agent-bridge" element={<AIAgentBridgeMeeting />} />

              {/* Headless AI Agent - Runs in Puppeteer on Windows VM */}
              <Route path="/headless-agent" element={<HeadlessAgentPage />} />

              {/* LIFF deep link compatibility (when LIFF Endpoint URL is /setup) */}
              <Route path="/setup/agent-call" element={<AgentCallTrigger />} />
              <Route path="/setup/agent-call-meeting" element={<AgentCallMeeting />} />
              <Route path="/setup/schedule-retry" element={<ScheduleRetryPage />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </VideoSDKProvider>
    </LiffProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
