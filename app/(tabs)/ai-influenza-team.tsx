import {useMemo} from "react";
import {Linking,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {ScreenContainer} from "@/components/screen-container";
import {GlassBackdrop} from "@/components/glass/glass-backdrop";
import {GlassCard,GlowButton,StatusChip} from "@/components/glass/glass-primitives";
import {NavDrawer,NavDrawerButton,useNavDrawer} from "@/components/responsive/nav-drawer";
import {glassPalette,glassSurface} from "@/lib/design/future-glass";
import {trpc} from "@/lib/trpc";

function money(cents:number){return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(cents/100);}

export default function AiInfluenzaTeamScreen(){
  const nav=useNavDrawer();
  const me=trpc.account.me.useQuery(undefined,{retry:false});
  const isAdmin=me.data?.role==="admin";
  const catalog=trpc.aiInfluenzaTeam.catalog.useQuery(undefined,{retry:false});
  const overview=trpc.aiInfluenzaTeam.overview.useQuery(undefined,{enabled:isAdmin,retry:false,refetchInterval:60_000});
  const leads=trpc.aiInfluenzaTeam.leadPipeline.useQuery(undefined,{enabled:isAdmin,retry:false,refetchInterval:60_000});
  const profit=trpc.aiInfluenzaTeam.profit.useQuery({windowDays:30},{enabled:isAdmin,retry:false,refetchInterval:60_000});
  const agents=trpc.aiInfluenzaTeam.agents.useQuery(undefined,{enabled:isAdmin,retry:false});
  const media=trpc.mediaPipeline.status.useQuery(undefined,{enabled:Boolean(me.data),retry:false});
  const checkout=trpc.aiInfluenzaTeam.checkout.useMutation({
    onSuccess:result=>{void Linking.openURL(result.url);},
  });
  const portal=trpc.aiInfluenzaTeam.portal.useMutation({
    onSuccess:result=>{void Linking.openURL(result.url);},
  });
  const packages=useMemo(()=>catalog.data?.packages??[],[catalog.data]);

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

        <Text style={s.sectionTitle}>Buchbare Pakete</Text>
        {packages.map(pkg=><GlassCard key={pkg.id} accent={pkg.id==="business"?"magenta":pkg.id==="growth"?"cyan":"blue"} style={s.card}>
          <View style={s.packageHead}><View style={{flex:1}}><Text style={s.packageName}>{pkg.name}</Text><Text style={s.price}>{money(pkg.monthlyPriceCents)} / Monat</Text></View><StatusChip label="Abo" accent="green"/></View>
          {pkg.deliverables.map(item=><Text key={item} style={s.line}>• {item}</Text>)}
          <Text style={s.notice}>{pkg.hypothesisNotice}</Text>
          <GlowButton
            label={checkout.isPending?"Checkout wird vorbereitet …":`${pkg.name} buchen`}
            accent={pkg.id==="business"?"magenta":"cyan"}
            disabled={!me.data||checkout.isPending}
            onPress={()=>checkout.mutate({packageId:pkg.id})}
          />
        </GlassCard>)}
        {checkout.error?<Text style={s.error}>{checkout.error.message}</Text>:null}

        <GlassCard accent="cyan" style={s.card}>
          <Text style={s.sectionTitle}>Stripe & Subscriptions</Text>
          <Text style={s.copy}>Checkout und Zahlungsstatus laufen über die vorhandene signaturgeprüfte CyberSarah-Stripe-Integration. Rechnungen, Kündigungen und Upgrades bleiben im Stripe-Kundenportal nachvollziehbar.</Text>
          <GlowButton label={portal.isPending?"Portal öffnet …":"Kundenportal öffnen"} accent="cyan" variant="secondary" disabled={!me.data||portal.isPending} onPress={()=>portal.mutate()}/>
          {portal.error?<Text style={s.error}>{portal.error.message}</Text>:null}
        </GlassCard>

        {isAdmin?<>
          <Text style={s.sectionTitle}>Revenue Dashboard</Text>
          <View style={s.metrics}>
            <Metric label="Aufträge" value={overview.data?.counts.orders??"—"}/>
            <Metric label="Agent Tasks" value={overview.data?.counts.tasks??"—"}/>
            <Metric label="Leads" value={leads.data?.counts.total??"—"}/>
            <Metric label="Hot Leads" value={leads.data?.counts.hot??"—"}/>
            <Metric label="Kunden" value={leads.data?.counts.customers??"—"}/>
            <Metric label="Revenue 30d" value={profit.data?money(profit.data.recognizedRevenueCents):"—"}/>
            <Metric label="Kosten 30d" value={profit.data?money(profit.data.totalCostCents):"—"}/>
            <Metric label="Deckungsbeitrag" value={profit.data?money(profit.data.contributionCents):"—"}/>
          </View>

          <GlassCard accent="purple" style={s.card}>
            <Text style={s.sectionTitle}>AI Agent Team</Text>
            {(agents.data??[]).map(agent=><View key={agent.id} style={s.agent}>
              <Text style={s.agentName}>{agent.name}</Text>
              <Text style={s.copy}>{agent.mission}</Text>
            </View>)}
          </GlassCard>

          <GlassCard accent="green" style={s.card}>
            <Text style={s.sectionTitle}>Lead Pipeline</Text>
            <Text style={s.copy}>Hot {leads.data?.counts.hot??0} · Warm {leads.data?.counts.warm??0} · Opt-out {leads.data?.counts.optedOut??0}</Text>
            <Text style={s.notice}>Externe Kontaktaufnahme ist nicht automatisch freigegeben. Quellen, Rechtsgrundlage und Opt-outs bleiben Bestandteil jedes Lead-Datensatzes.</Text>
          </GlassCard>

          <GlassCard accent="green" style={s.card}>
            <Text style={s.sectionTitle}>Profit Analytics</Text>
            <Text style={s.copy}>Erkannter Umsatz: {profit.data?money(profit.data.recognizedRevenueCents):"—"} · Kosten: {profit.data?money(profit.data.totalCostCents):"—"} · Marge: {profit.data?.marginPct===null||profit.data?.marginPct===undefined?"—":profit.data.marginPct+"%"}</Text>
            <Text style={s.notice}>Quelle: verifizierte Stripe-Invoices minus separat erfasste Cost-Events. Paketpreise werden nicht als Umsatz angenommen.</Text>
          </GlassCard>

          <GlassCard accent="amber" style={s.card}>
            <Text style={s.sectionTitle}>Autopilot Control Center</Text>
            <Text style={s.copy}>Standardmodus: Assisted. Interne Analyse, Planung und Drafts dürfen autonom laufen. Zahlungen, Verträge, externe Sends, Veröffentlichungen und sensible Kundenaktionen benötigen bestehende Freigabe-/Policy-Gates.</Text>
          </GlassCard>
        </>:null}
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
});
