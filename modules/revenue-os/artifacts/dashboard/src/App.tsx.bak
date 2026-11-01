import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Agents from "@/pages/agents";
import Campaigns from "@/pages/campaigns";
import Content from "@/pages/content";
import Finance from "@/pages/finance";
import Logs from "@/pages/logs";
import Chancen from "@/pages/chancen";
import FinanceTeam from "@/pages/financeTeam";
import Expansion from "@/pages/expansion";
import SofortStart from "@/pages/sofortStart";
import Trading from "@/pages/trading";
import Einstellungen from "@/pages/einstellungen";
import InfluencerHub from "@/pages/influencerHub";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MasterAgentTab from "@/pages/masterAgent";
import Influencer from "@/pages/influencer";
import Hara from "@/pages/hara";
import SeoContent from "@/pages/seoContent";
import EmailListen from "@/pages/emailListen";
import FacelessVideo from "@/pages/facelessVideo";
import ContentRecycling from "@/pages/contentRecycling";
import Attribution from "@/pages/attribution";
import Newsletter from "@/pages/newsletter";
import WhatsApp from "@/pages/whatsapp";
import { useEffect } from "react";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={() => <ErrorBoundary name="Dashboard"><Dashboard /></ErrorBoundary>} />
        <Route path="/sofort-start" component={() => <ErrorBoundary name="SofortStart"><SofortStart /></ErrorBoundary>} />
        <Route path="/trading" component={() => <ErrorBoundary name="Trading"><Trading /></ErrorBoundary>} />
        <Route path="/chancen" component={() => <ErrorBoundary name="Chancen"><Chancen /></ErrorBoundary>} />
        <Route path="/finance-team" component={() => <ErrorBoundary name="FinanceTeam"><FinanceTeam /></ErrorBoundary>} />
        <Route path="/hara" component={() => <ErrorBoundary name="Hara"><Hara /></ErrorBoundary>} />
        <Route path="/expansion" component={() => <ErrorBoundary name="Expansion"><Expansion /></ErrorBoundary>} />
        <Route path="/agenten" component={() => <ErrorBoundary name="Agents"><Agents /></ErrorBoundary>} />
        <Route path="/kampagnen" component={() => <ErrorBoundary name="Campaigns"><Campaigns /></ErrorBoundary>} />
        <Route path="/content" component={() => <ErrorBoundary name="Content"><Content /></ErrorBoundary>} />
        <Route path="/finanzen" component={() => <ErrorBoundary name="Finance"><Finance /></ErrorBoundary>} />
        <Route path="/attribution" component={() => <ErrorBoundary name="Attribution"><Attribution /></ErrorBoundary>} />
        <Route path="/protokolle" component={() => <ErrorBoundary name="Logs"><Logs /></ErrorBoundary>} />
        <Route path="/einstellungen" component={() => <ErrorBoundary name="Einstellungen"><Einstellungen /></ErrorBoundary>} />
        <Route path="/influencer-hub" component={() => <ErrorBoundary name="InfluencerHub"><InfluencerHub /></ErrorBoundary>} />
        <Route path="/master-agent" component={() => <ErrorBoundary name="MasterAgentTab"><MasterAgentTab /></ErrorBoundary>} />
        <Route path="/influencer" component={() => <ErrorBoundary name="Influencer"><Influencer /></ErrorBoundary>} />
        <Route path="/seo-content" component={() => <ErrorBoundary name="SeoContent"><SeoContent /></ErrorBoundary>} />
        <Route path="/email-listen" component={() => <ErrorBoundary name="EmailListen"><EmailListen /></ErrorBoundary>} />
        <Route path="/faceless-video" component={() => <ErrorBoundary name="FacelessVideo"><FacelessVideo /></ErrorBoundary>} />
        <Route path="/content-recycling" component={() => <ErrorBoundary name="ContentRecycling"><ContentRecycling /></ErrorBoundary>} />
        <Route path="/newsletter" component={() => <ErrorBoundary name="Newsletter"><Newsletter /></ErrorBoundary>} />
        <Route path="/whatsapp" component={() => <ErrorBoundary name="WhatsApp"><WhatsApp /></ErrorBoundary>} />
        <Route path="/email" component={() => <ErrorBoundary name="EmailAutomation"><EmailAutomation /></ErrorBoundary>} />
        <Route path="/social-media" component={() => <ErrorBoundary name="SocialMedia"><SocialMedia /></ErrorBoundary>} />
        <Route path="/push" component={() => <ErrorBoundary name="PushNotifications"><PushNotifications /></ErrorBoundary>} />
        <Route path="/stripe" component={() => <ErrorBoundary name="StripeDashboard"><StripeDashboard /></ErrorBoundary>} />
        <Route path="/stripe/produkte" component={() => <ErrorBoundary name="StripeProdukte"><StripeProdukte /></ErrorBoundary>} />
        <Route path="/stripe/zahlungen" component={() => <ErrorBoundary name="StripeZahlungen"><StripeZahlungen /></ErrorBoundary>} />
        <Route path="/stripe/abos" component={() => <ErrorBoundary name="StripeAbos"><StripeAbos /></ErrorBoundary>} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
