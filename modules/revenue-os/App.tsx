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
        <Route path="/" component={Dashboard} />
        <Route path="/sofort-start" component={SofortStart} />
        <Route path="/trading" component={Trading} />
        <Route path="/chancen" component={Chancen} />
        <Route path="/finance-team" component={FinanceTeam} />
        <Route path="/hara" component={Hara} />
        <Route path="/expansion" component={Expansion} />
        <Route path="/agenten" component={Agents} />
        <Route path="/kampagnen" component={Campaigns} />
        <Route path="/content" component={Content} />
        <Route path="/finanzen" component={Finance} />
        <Route path="/attribution" component={Attribution} />
        <Route path="/protokolle" component={Logs} />
        <Route path="/einstellungen" component={Einstellungen} />
        <Route path="/influencer" component={Influencer} />
        <Route path="/seo-content" component={SeoContent} />
        <Route path="/email-listen" component={EmailListen} />
        <Route path="/faceless-video" component={FacelessVideo} />
        <Route path="/content-recycling" component={ContentRecycling} />
        <Route path="/newsletter" component={Newsletter} />
        <Route path="/whatsapp" component={WhatsApp} />
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
