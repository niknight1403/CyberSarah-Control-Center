import {ActivityIndicator,Pressable,StyleSheet,Text,View} from "react-native";
import {trpc} from "@/lib/trpc";
import {glassDepth,glassPalette,glassSurface} from "@/lib/design/future-glass";

/**
 * Real, owner-scoped publishing operations scorecard.
 * Failures/empty data are never displayed as fabricated success.
 */
export function PublishingOpsAdminCard({isAdmin}:{isAdmin:boolean}){
  const q=trpc.publishing.opsOverview.useQuery(undefined,{
    enabled:isAdmin,retry:false,refetchInterval:30_000,
  });
  if(!isAdmin)return null;
  const stats=q.data;
  const retry=trpc.publishing.retryFailed.useMutation({
    onSuccess:()=>{void q.refetch();},
  });
  const metrics=[
    {name:"Fällig",value:stats?.due??null,severity:"normal"},
    {name:"Geplant",value:stats?.scheduled??null,severity:"normal"},
    {name:"In Arbeit",value:stats?.active??null,severity:"normal"},
    {name:"Verwaist",value:stats?.staleActive??null,severity:"alert"},
    {name:"Unklar",value:stats?.uncertain??null,severity:"alert"},
    {name:"Fehler",value:stats?.failed??null,severity:"alert"},
    {name:"Sicher wiederholbar",value:stats?.retryableFailed??null,severity:"warning"},
    {name:"Live in 24 h",value:stats?.published24h??null,severity:"normal"},
  ] as const;
  return <View style={[styles.card,{backgroundColor:glassDepth.glass,borderColor:glassSurface.border}]}>
    <View style={styles.top}>
      <Text style={[styles.title,{color:glassSurface.textPrimary}]}>Publishing – Betriebsübersicht</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Publishing-Status aktualisieren"
        disabled={q.isFetching} onPress={()=>void q.refetch()}
        style={[styles.refresh,{borderColor:glassSurface.border}]}>
        <Text style={{color:glassPalette.cyan,fontWeight:"700"}}>Aktualisieren</Text>
      </Pressable>
    </View>
    <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
      Echte Daten für dieses Administratorkonto. Keine simulierten Posts und keine automatische Wiederholung unklarer Versandfälle.
    </Text>
    {q.isFetching?<ActivityIndicator color={glassPalette.cyan}/>:null}
    {q.error?<Text style={[styles.warning,{color:glassPalette.red}]}>
      Statusdaten nicht verfügbar: {q.error.message}. Keine Messwerte können bestätigt werden.
    </Text>:null}
    {stats&&!q.error?<>
      <Text style={[styles.status,{color:stats.autopilotConfigured?glassPalette.cyan:glassPalette.amber}]}>
        Autopilot-Konfiguration: {stats.autopilotConfigured?"aktiviert":"deaktiviert"}
      </Text>
      <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
        Konfiguration ist kein Nachweis eines erfolgreichen Plattformversands.
        Zeitpunkt der Datenabfrage: {new Date(stats.checkedAt).toLocaleString("de-DE")}
      </Text>
      <View style={styles.grid}>
        {metrics.map(m=><View key={m.name} style={[styles.metric,{borderColor:glassSurface.border}]}>
          <Text style={[styles.number,{
            color:m.severity==="alert"&&m.value?glassPalette.red:
              m.severity==="warning"&&m.value?glassPalette.amber:glassSurface.textPrimary,
          }]}>{m.value??"–"}</Text>
          <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>{m.name}</Text>
        </View>)}
      </View>
      {stats.failureReasons.totalFailedJobs>0?<View style={[styles.blocker,{borderColor:glassPalette.red}]}>
        <Text style={[styles.title,{color:glassPalette.red}]}>Fehlerdiagnose</Text>
        <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
          {stats.failureReasons.totalFailedJobs} fehlgeschlagene oder unklare Jobs · {stats.failureReasons.withoutErrorText} ohne gespeicherten Fehlertext
        </Text>
        {stats.failureReasons.byCause.map(item=><View key={item.cause} style={styles.failureRow}>
          <View style={{flex:1,gap:2}}>
            <Text style={[styles.failureTitle,{color:glassSurface.textPrimary}]}>{item.cause.replaceAll("_"," ") } · {item.count}</Text>
            <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>{item.hint}</Text>
            <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>Plattformen: {item.platforms.map(p=>p.toUpperCase()).join(", ")}</Text>
          </View>
        </View>)}
        {stats.failureReasons.byPlatform.map(item=><View key={item.platform} style={styles.modeRow}>
          <Text style={[styles.modeLabel,{color:glassSurface.textPrimary}]}>{item.platform.toUpperCase()}</Text>
          <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
            {item.failures} Fehler · {item.retryable} wiederholbar · {item.manualReview} manuell
          </Text>
        </View>)}
        <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>{stats.failureReasons.note}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Sicher wiederholbare fehlgeschlagene Jobs erneut einplanen"
          disabled={retry.isPending||stats.failureReasons.retryable===0}
          onPress={()=>retry.mutate()}
          style={[styles.refresh,{borderColor:glassSurface.border,opacity:retry.isPending||stats.failureReasons.retryable===0?0.5:1}]}>
          <Text style={{color:glassPalette.cyan,fontWeight:"700"}}>
            {retry.isPending?"Prüfe Jobs …":"Sichere Wiederholungen prüfen"}
          </Text>
        </Pressable>
        {retry.error?<Text style={[styles.warning,{color:glassPalette.red}]}>{retry.error.message}</Text>:null}
        {retry.data?<Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
          Ergebnis: {retry.data.requeued} erneut eingeplant, {retry.data.skipped.length} übersprungen. {retry.data.detail??""}
        </Text>:null}
        {retry.data?.skipped.map(item=><Text key={item.id} style={[styles.hint,{color:glassSurface.textSecondary}]}>
          Job #{item.id}: {item.reason.replaceAll("_"," ")}
        </Text>)}
        {retry.data?.tokenRefresh?.detail?<Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
          Token-Prüfung: {retry.data.tokenRefresh.detail}
        </Text>:null}
      </View>:null}
      {stats.uncertainBlockers.credentialsBlocked.length>0?<View style={[styles.blocker,{borderColor:glassPalette.amber}]}>
        <Text style={[styles.title,{color:glassPalette.amber}]}>Unklare Vorgänge: Zugang prüfen</Text>
        {stats.uncertainBlockers.guidance.map(line=><Text key={line} style={[styles.hint,{color:glassSurface.textSecondary}]}>
          {line}
        </Text>)}
        {stats.uncertainBlockers.credentialsBlocked.map(entry=>entry.detail?<Text key={entry.platform}
          style={[styles.hint,{color:glassSurface.textSecondary}]} numberOfLines={3}>
          Letzter gespeicherter Grund ({entry.platform.toUpperCase()}): {entry.detail}
        </Text>:null)}
        <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
          {stats.uncertainBlockers.note} Neue Läufe zählen blockierte Vorgänge getrennt und schreiben keinen weiteren Fehlertext.
        </Text>
      </View>:null}
      <Text style={[styles.title,{color:glassSurface.textPrimary}]}>Plattform-Bereitschaft</Text>
      {Object.entries(stats.modes).map(([platform,info])=><View key={platform} style={styles.modeRow}>
        <Text style={[styles.modeLabel,{color:glassSurface.textPrimary}]}>{platform.toUpperCase()}</Text>
        <Text style={[styles.modeStatus,{color:info.mode==="live"?glassPalette.green:glassPalette.amber}]}>
          {info.mode==="live"?"Konfiguriert":"Blockiert"}
        </Text>
      </View>)}
      <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
        „Konfiguriert“ bedeutet, dass Credentials und erforderliche Grundvoraussetzungen erkannt wurden; dies bestätigt nicht die tatsächliche Erreichbarkeit der Plattform.
      </Text>
    </>:null}
  </View>;
}

const styles=StyleSheet.create({
  card:{borderWidth:1,borderRadius:14,padding:14,gap:10},
  top:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
  title:{fontSize:14,fontWeight:"800",flexShrink:1},
  hint:{fontSize:11,lineHeight:17},
  status:{fontSize:13,fontWeight:"700"},
  warning:{fontSize:12,lineHeight:17},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:8},
  metric:{minWidth:90,flexGrow:1,borderWidth:1,borderRadius:10,padding:10,gap:3},
  number:{fontSize:19,fontWeight:"800"},
  blocker:{borderWidth:1,borderRadius:12,padding:10,gap:6},
  failureRow:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:glassSurface.border,paddingTop:7},
  failureTitle:{fontSize:12,fontWeight:"800"},
  modeRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10},
  modeLabel:{fontSize:11,fontWeight:"700"},
  modeStatus:{fontSize:11,fontWeight:"800"},
  refresh:{borderWidth:1,padding:9,minHeight:40,borderRadius:8,justifyContent:"center"},
});