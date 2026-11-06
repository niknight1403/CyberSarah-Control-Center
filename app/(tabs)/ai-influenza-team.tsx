import {useMemo,useState} from "react";
import {Linking,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {ScreenContainer} from "@/components/screen-container";
import {GlassBackdrop} from "@/components/glass/glass-backdrop";
import {GlassCard,GlowButton,StatusChip} from "@/components/glass/glass-primitives";
import {NavDrawer,NavDrawerButton,useNavDrawer} from "@/components/responsive/nav-drawer";
import { LegalFooter } from "@/components/legal/legal-footer";
import {glassPalette,glassSurface} from "@/lib/design/future-glass";
import {trpc} from "@/lib/trpc";
import {useLocalSearchParams} from "expo-router";
import {resolveRequestedPackage} from "@/lib/post-login-navigation-logic";
import {
  AI_INFLUENZA_DASHBOARD_VIEWS,
  buildAiInfluenzaHealthVerdict,
  formatEuroCents,
  formatPercent,
  readNumber,
  resolveAiInfluenzaDashboardView,
  type AiInfluenzaDashboardViewId,
} from "@/lib/ai-influenza-dashboard-logic";

function money(cents:number){return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(cents/100);}

export default function AiInfluenzaTeamScreen(){
  const nav=useNavDrawer();
  const me=trpc.account.me.useQuery(undefined,{retry:false});
  const isAdmin=me.data?.role==="admin";
  const eliteAccess=trpc.aiInfluenzaTeam.adminEliteAccess.useQuery(undefined,{enabled:isAdmin,retry:false});
  const catalog=trpc.aiInfluenzaTeam.catalog.useQuery(undefined,{retry:false});
  const overview=trpc.aiInfluenzaTeam.overview.useQuery(undefined,{enabled:isAdmin,retry:false,refetchInterval:60_000});
  const leads=trpc.aiInfluenzaTeam.leadPipeline.useQuery(undefined,{enabled:isAdmin,retry:false,refetchInterval:60_000});
  const profit=trpc.aiInfluenzaTeam.profit.useQuery({windowDays:30},{enabled:isAdmin,retry:false,refetchInterval:60_000});
  const agents=trpc.aiInfluenzaTeam.agents.useQuery(undefined,{enabled:isAdmin,retry:false});
  const introRequests=trpc.aiInfluenzaTeam.introRequests.useQuery({limit:20},{enabled:isAdmin,retry:false,refetchInterval:60_000});
  const media=trpc.mediaPipeline.status.useQuery(undefined,{enabled:Boolean(me.data),retry:false});
  const checkout=trpc.aiInfluenzaTeam.checkout.useMutation({
    onSuccess:result=>{void Linking.openURL(result.url);},
  });
  const sandbox=trpc.aiInfluenzaTeam.adminSandboxOrder.useMutation({
    onSuccess:()=>{void overview.refetch();},
  });
  const markIntro=trpc.aiInfluenzaTeam.markIntroRequestHandled.useMutation({
    onSuccess:()=>{void introRequests.refetch();},
  });
  const portal=trpc.aiInfluenzaTeam.portal.useMutation({
    onSuccess:result=>{void Linking.openURL(result.url);},
  });
  const packages=useMemo(()=>catalog.data?.packages??[],[catalog.data]);
  // Kommt der Besucher von der Verkaufsseite, ist sein Paket schon gewaehlt.
  const navParams=useLocalSearchParams<{package?:string}>();
  const requestedPackage=useMemo(
    ()=>resolveRequestedPackage(navParams.package,packages.map(p=>p.id)),
    [navParams.package,packages],
  );
  const [viewId,setViewId]=useState<AiInfluenzaDashboardViewId>("revenue");
  const activeView=resolveAiInfluenzaDashboardView(viewId);
  const health=buildAiInfluenzaHealthVerdict({
    databaseAvailable:Boolean(overview.data)&&!overview.error,
    openOrders:readNumber(overview.data?.counts,"orders"),
    waitingApprovals:readNumber(overview.data?.counts?.steps,"approval"),
  });

  return <GlassBackdrop accent="magenta">
    <ScreenContainer edges={["top","left","right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
      <View style={s.topBar}>
        <NavDrawerButton {...nav.hamburgerProps} tint={glassPalette.magenta}/>
        <View style={{flex:1}}>
          <Text style={s.eyebrow}>CYBERSARAH · PHASE 7</Text>
          <Text style={s.title}>AI Influenza Team</Text>
        </View>
        <StatusChip label="Assisted" accent="magenta" live/>
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <GlassCard accent="magenta" glow={2} style={s.card}>
          <Text style={s.kicker}>AUTONOME AI AGENCY & REVENUE ENGINE</Text>
          <Text style={s.hero}>Ein buchbares KI-Marketing-Team mit nachvollziehbarer Delivery.</Text>
          <Text style={s.copy}>Marktanalyse, CRM, Angebote, Content, Video, Reporting und Profit-Analyse laufen auf bestehenden CyberSarah-Systemen. Zahlungen, externe Veröffentlichungen und sensible Kundenaktionen bleiben geschützt.</Text>
          <View style={s.row}>
            <StatusChip label={media.data?.video.available?"Video bereit":"Video prüfen"} accent={media.data?.video.available?"green":"amber"}/>
            <StatusChip label={isAdmin?"Admin Control":"Customer View"} accent={isAdmin?"cyan":"blue"}/>
          </View>
        </GlassCard>

        {isAdmin?<GlassCard accent="green" style={s.card}>
          <Text style={s.sectionTitle}>Elite · Administrator</Text>
          <Text style={s.copy}>{eliteAccess.data?.enabled?"Alle AI-Influenza-Adminfunktionen freigeschaltet – kostenlos, ohne Stripe und ohne Umsatzbuchung.":"Elite-Berechtigung wird geprüft …"}</Text>
          <StatusChip label={eliteAccess.data?.enabled?"ELITE AKTIV":"PRÜFUNG"} accent={eliteAccess.data?.enabled?"green":"amber"}/>
          {eliteAccess.error?<Text style={s.error}>{eliteAccess.error.message}</Text>:null}
          <Text style={s.notice}>Externe Veröffentlichungen, Kundennachrichten und kostenpflichtige Aktionen benötigen weiterhin Freigaben.</Text>
        </GlassCard>:null}

        <Text style={s.sectionTitle}>Ansichten</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.viewTabs}>
          {AI_INFLUENZA_DASHBOARD_VIEWS.map(view=><Pressable
            key={view.id}
            accessibilityRole="tab"
            accessibilityState={{selected:view.id===activeView.id}}
            onPress={()=>setViewId(view.id)}
            style={[s.viewTab,view.id===activeView.id&&s.viewTabActive]}>
            <Text style={[s.viewTabText,view.id===activeView.id&&s.viewTabTextActive]}>{view.title}</Text>
          </Pressable>)}
        </ScrollView>
        <GlassCard accent="cyan" style={s.card}>
          <Text style={s.kicker}>{activeView.title.toUpperCase()}</Text>
          <Text style={s.copy}>{activeView.purpose}</Text>
          {activeView.requiresAdmin&&!isAdmin?<Text style={s.notice}>Diese Ansicht ist nur für Administratoren freigegeben.</Text>:null}
        </GlassCard>

        <Text style={s.sectionTitle}>Buchbare Pakete</Text>
        {packages.map(pkg=><GlassCard key={pkg.id} accent={pkg.id==="business"?"magenta":pkg.id==="growth"?"cyan":"blue"} style={s.card}>
          <View style={s.packageHead}><View style={{flex:1}}><Text style={s.packageName}>{pkg.name}</Text><Text style={s.price}>{money(pkg.monthlyPriceCents)} / Monat</Text></View><StatusChip label={pkg.id===requestedPackage?"deine Wahl":"Abo"} accent={pkg.id===requestedPackage?"magenta":"green"}/></View>
          {pkg.id===requestedPackage?<Text style={s.notice}>Dieses Paket hattest du auf der Verkaufsseite gewählt. Der Checkout ist der nächste Schritt.</Text>:null}
          {pkg.deliverables.map(item=><Text key={item} style={s.line}>• {item}</Text>)}
          <Text style={s.notice}>{pkg.hypothesisNotice}</Text>
          {isAdmin?<GlowButton
            label={sandbox.isPending?"Testauftrag wird erstellt …":`Admin-Testauftrag: ${pkg.name}`}
            accent="green"
            variant="secondary"
            disabled={sandbox.isPending}
            onPress={()=>sandbox.mutate({packageId:pkg.id})}
          />:null}
          <GlowButton
            label={checkout.isPending?"Checkout wird vorbereitet …":`${pkg.name} buchen`}
            accent={pkg.id==="business"?"magenta":"cyan"}
            variant={pkg.id===requestedPackage?"primary":"secondary"}
            disabled={!me.data||checkout.isPending}
            onPress={()=>checkout.mutate({packageId:pkg.id})}
          />
        </GlassCard>)}
        {sandbox.data?<Text style={s.notice}>Admin-Testauftrag erstellt: {sandbox.data.orderId} · Testmodus, keine Zahlung, kein Umsatz.</Text>:null}
        {sandbox.error?<Text style={s.error}>{sandbox.error.message}</Text>:null}
        {checkout.error?<Text style={s.error}>{checkout.error.message}</Text>:null}

        <GlassCard accent="cyan" style={s.card}>
          <Text style={s.sectionTitle}>Stripe & Subscriptions</Text>
          <Text style={s.copy}>Checkout und Zahlungsstatus laufen über die vorhandene signaturgeprüfte CyberSarah-Stripe-Integration. Rechnungen, Kündigungen und Upgrades bleiben im Stripe-Kundenportal nachvollziehbar.</Text>
          <GlowButton label={portal.isPending?"Portal öffnet …":"Kundenportal öffnen"} accent="cyan" variant="secondary" disabled={!me.data||portal.isPending} onPress={()=>portal.mutate()}/>
          {portal.error?<Text style={s.error}>{portal.error.message}</Text>:null}
        </GlassCard>

                {isAdmin?<>
          {activeView.id==="revenue"?<>
            <Text style={s.sectionTitle}>Revenue Dashboard</Text>
            <View style={s.metrics}>
              <Metric label="Aufträge" value={overview.data?.counts.orders??"—"}/>
              <Metric label="Agent Tasks" value={overview.data?.counts.tasks??"—"}/>
              <Metric label="Leads" value={leads.data?.counts.total??"—"}/>
              <Metric label="Hot Leads" value={leads.data?.counts.hot??"—"}/>
              <Metric label="Kunden" value={leads.data?.counts.customers??"—"}/>
              <Metric label="Revenue 30d" value={formatEuroCents(profit.data?profit.data.recognizedRevenueCents:null)}/>
              <Metric label="Kosten 30d" value={formatEuroCents(profit.data?profit.data.totalCostCents:null)}/>
              <Metric label="Deckungsbeitrag" value={formatEuroCents(profit.data?profit.data.contributionCents:null)}/>
            </View>
          </>:null}

          <GlassCard accent="magenta" style={s.card}>
            <Text style={s.sectionTitle}>Erstgespräche von der Verkaufsseite</Text>
            <Text style={s.copy}>{introRequests.data?`${introRequests.data.summary.open} offen · ${introRequests.data.summary.handled} erledigt · ${introRequests.data.summary.total} gesamt`:"Anfragen werden geladen …"}</Text>
            {(introRequests.data?.requests??[]).slice(0,5).map(request=><View key={request.id} style={s.agent}>
              <Text style={s.agentName}>{request.name} · {request.company}</Text>
              <Text style={s.line}>{request.email} · Paket: {request.packageLabel} · Wunsch: {request.preferredWindowLabel}</Text>
              {request.goal?<Text style={s.line}>{request.goal}</Text>:null}
              <Text style={s.notice}>{request.handled?`erledigt${request.handledAt?" · "+request.handledAt.slice(0,10):""}`:"offen"} · Lead-Score {request.leadScore??"—"} ({request.leadTier??"—"})</Text>
              {request.handled?null:<GlowButton
                label="Als erledigt markieren"
                accent="green"
                variant="secondary"
                disabled={markIntro.isPending}
                onPress={()=>markIntro.mutate({requestId:request.id,handled:true})}
              />}
            </View>)}
            {introRequests.data&&introRequests.data.requests.length===0?<Text style={s.notice}>Noch keine Anfrage über die Verkaufsseite. Ein Eintrag entsteht nur durch eine echte Anfrage.</Text>:null}
            {introRequests.error?<Text style={s.error}>{introRequests.error.message}</Text>:null}
          </GlassCard>

          {activeView.id==="agents"?<GlassCard accent="purple" style={s.card}>
            <Text style={s.sectionTitle}>AI Agent Team</Text>
            {(agents.data??[]).map(agent=><View key={agent.id} style={s.agent}>
              <Text style={s.agentName}>{agent.name}</Text>
              <Text style={s.copy}>{agent.mission}</Text>
              <Text style={s.notice}>Externe Aktionen: {agent.externalActionAllowed?"erlaubt":"nur mit Freigabe"}</Text>
            </View>)}
          </GlassCard>:null}

          {activeView.id==="leads"?<GlassCard accent="green" style={s.card}>
            <Text style={s.sectionTitle}>Lead Pipeline</Text>
            <Text style={s.copy}>Hot {leads.data?.counts.hot??0} · Warm {leads.data?.counts.warm??0} · Opt-out {leads.data?.counts.optedOut??0}</Text>
            <Text style={s.notice}>Externe Kontaktaufnahme ist nicht automatisch freigegeben. Quellen, Rechtsgrundlage und Opt-outs bleiben Bestandteil jedes Lead-Datensatzes.</Text>
          </GlassCard>:null}

          {activeView.id==="customers"?<GlassCard accent="cyan" style={s.card}>
            <Text style={s.sectionTitle}>Customer Management</Text>
            <Text style={s.copy}>Offene Aufträge: {overview.data?.counts.orders??"—"} · Agent Tasks: {overview.data?.counts.tasks??"—"} · Kunden im Netzwerk: {leads.data?.counts.customers??"—"}</Text>
            <Text style={s.notice}>Auftragsdetails, Workflow-Schritt und Lieferplan je Kunde liegen in der Auftrags-Engine; der Kundenweg ist gegen PostgreSQL getestet.</Text>
          </GlassCard>:null}

          {activeView.id==="content"?<GlassCard accent="purple" style={s.card}>
            <Text style={s.sectionTitle}>Content Factory</Text>
            <Text style={s.copy}>Video-Pipeline: {media.data?.video.available?"verfügbar":"nicht verfügbar"} · Entwürfe werden erst nach Qualitätsprüfung veröffentlicht.</Text>
            <Text style={s.notice}>Kein automatisches Publishing: Entwürfe laufen über die bestehenden Draft-/Freigabe-Gates.</Text>
          </GlassCard>:null}

          {activeView.id==="campaigns"?<GlassCard accent="amber" style={s.card}>
            <Text style={s.sectionTitle}>Campaign Manager</Text>
            <Text style={s.notice}>Noch keine Datenquelle für Kampagnen. Kanalplanung je Kunde folgt mit der Content-Pipeline (Sprint 6); hier wird keine Zahl angezeigt, solange sie nicht belegt ist.</Text>
          </GlassCard>:null}

          {activeView.id==="billing"?<GlassCard accent="cyan" style={s.card}>
            <Text style={s.sectionTitle}>Stripe & Subscriptions</Text>
            <Text style={s.copy}>Paketpreise: {packages.map(pkg=>`${pkg.name} ${formatEuroCents(pkg.monthlyPriceCents)}`).join(" · ")||"—"}</Text>
            <Text style={s.notice}>Erkannter Umsatz stammt ausschließlich aus verifizierten Stripe-Events, nicht aus Paketpreisen.</Text>
          </GlassCard>:null}

          {activeView.id==="profit"?<GlassCard accent="green" style={s.card}>
            <Text style={s.sectionTitle}>Profit Analytics</Text>
            <Text style={s.copy}>Erkannter Umsatz: {formatEuroCents(profit.data?profit.data.recognizedRevenueCents:null)} · Kosten: {formatEuroCents(profit.data?profit.data.totalCostCents:null)} · Marge: {formatPercent(profit.data?profit.data.marginPct:null)}</Text>
            <Text style={s.notice}>Quelle: verifizierte Stripe-Invoices minus separat erfasste Cost-Events. Paketpreise werden nicht als Umsatz angenommen.</Text>
          </GlassCard>:null}

          {activeView.id==="autopilot"?<GlassCard accent="amber" style={s.card}>
            <Text style={s.sectionTitle}>Autopilot Control Center</Text>
            <Text style={s.copy}>Standardmodus: Assisted. Interne Analyse, Planung und Drafts dürfen autonom laufen. Zahlungen, Verträge, externe Sends, Veröffentlichungen und sensible Kundenaktionen benötigen bestehende Freigabe-/Policy-Gates.</Text>
            <Text style={s.notice}>Der Tages-Autopilot führt die Sparte mit aus und schaltet nur Guard-erlaubte Schritte weiter.</Text>
          </GlassCard>:null}

          {activeView.id==="health"?<GlassCard accent={health.level==="ok"?"green":health.level==="warn"?"amber":"magenta"} style={s.card}>
            <Text style={s.sectionTitle}>System Health & QA</Text>
            <View style={s.row}>
              <StatusChip label={health.label} accent={health.level==="ok"?"green":health.level==="warn"?"amber":"magenta"}/>
              <StatusChip label={media.data?.video.available?"Video bereit":"Video prüfen"} accent={media.data?.video.available?"green":"amber"}/>
            </View>
            {health.notes.map(note=><Text key={note} style={s.notice}>• {note}</Text>)}
          </GlassCard>:null}
        </>:null}
      
          <LegalFooter context="AI Influenza Team" />
        </ScrollView>
    </ScreenContainer>
    <NavDrawer {...nav.drawerProps}/>
  </GlassBackdrop>;
}

function Metric({label,value}:{label:string;value:string|number}){
  return <View style={s.metric}><Text style={s.metricValue}>{String(value)}</Text><Text style={s.metricLabel}>{label}</Text></View>;
}

const s=StyleSheet.create({
  topBar:{alignItems:"center",flexDirection:"row",gap:12,paddingHorizontal:16,paddingTop:10,paddingBottom:8},
  eyebrow:{color:glassPalette.magenta,fontSize:10,fontWeight:"900",letterSpacing:1.4},
  title:{color:glassSurface.textPrimary,fontSize:24,fontWeight:"900",marginTop:2},
  content:{gap:14,padding:16,paddingBottom:48},
  card:{gap:10},
  kicker:{color:glassPalette.magenta,fontSize:10,fontWeight:"900",letterSpacing:1.3},
  hero:{color:glassSurface.textPrimary,fontSize:22,fontWeight:"900",lineHeight:28},
  copy:{color:glassSurface.textSecondary,fontSize:12,lineHeight:18},
  row:{flexDirection:"row",flexWrap:"wrap",gap:8},
  sectionTitle:{color:glassSurface.textPrimary,fontSize:18,fontWeight:"900"},
  packageHead:{alignItems:"center",flexDirection:"row",gap:10},
  packageName:{color:glassSurface.textPrimary,fontSize:20,fontWeight:"900"},
  price:{color:glassPalette.cyan,fontSize:16,fontWeight:"900",marginTop:3},
  line:{color:glassSurface.textSecondary,fontSize:12,lineHeight:18},
  notice:{color:glassSurface.textMuted,fontSize:10,lineHeight:15},
  error:{color:glassPalette.amber,fontSize:12,lineHeight:18},
  metrics:{flexDirection:"row",flexWrap:"wrap",gap:8},
  metric:{backgroundColor:`${glassSurface.border}44`,borderColor:glassSurface.border,borderRadius:12,borderWidth:1,minWidth:96,flexGrow:1,padding:10},
  metricValue:{color:glassPalette.cyan,fontSize:17,fontWeight:"900"},
  metricLabel:{color:glassSurface.textMuted,fontSize:10,marginTop:3},
  agent:{borderTopColor:glassSurface.border,borderTopWidth:1,paddingTop:9,gap:4},
  agentName:{color:glassSurface.textPrimary,fontSize:13,fontWeight:"900"},
  viewTabs:{flexDirection:"row",gap:8,paddingVertical:2},
  viewTab:{borderColor:glassSurface.border,borderRadius:999,borderWidth:1,paddingHorizontal:12,paddingVertical:7},
  viewTabActive:{backgroundColor:`${glassPalette.cyan}22`,borderColor:glassPalette.cyan},
  viewTabText:{color:glassSurface.textMuted,fontSize:11,fontWeight:"800"},
  viewTabTextActive:{color:glassPalette.cyan},
});
