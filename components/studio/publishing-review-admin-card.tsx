/**
 * Mobile-first administrative review queue. No button sends a social post.
 * Every irreversible decision requires acknowledgement and written evidence.
 */
import {useState} from "react";
import {ActivityIndicator,Linking,Pressable,StyleSheet,Text,TextInput,View} from "react-native";
import {trpc} from "@/lib/trpc";
import {glassDepth,glassPalette,glassSurface} from "@/lib/design/future-glass";
import {
  REVIEW_PLATFORMS,reviewAgeLabel,reviewPlatformHome,reviewUrgency,
  validManualReviewReceipt,type ReviewPlatform,
} from "@/lib/publishing-review-logic";

type Decision="confirmed_published"|"closed_without_replay";
const PAGE_SIZE=10;

export function PublishingReviewAdminCard({isAdmin}:{isAdmin:boolean}) {
  const [offset,setOffset]=useState(0);
  const [platform,setPlatform]=useState<ReviewPlatform|"all">("all");
  const [searchInput,setSearchInput]=useState("");
  const [search,setSearch]=useState("");
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [decision,setDecision]=useState<Decision|null>(null);
  const [externalId,setExternalId]=useState("");
  const [evidence,setEvidence]=useState("");
  const [acknowledged,setAcknowledged]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const query=trpc.publishing.reviewQueue.useQuery({
    limit:PAGE_SIZE,offset,
    platform:platform==="all"?undefined:platform,
    search:search||undefined,
  },{enabled:isAdmin,retry:false,refetchInterval:30_000});
  const mutation=trpc.publishing.reconcile.useMutation();

  if(!isAdmin)return null;
  const jobs=query.data?.jobs??[];
  const hasFilter=Boolean(search)||platform!=="all";
  const reset=()=>{
    setSelectedId(null);setDecision(null);setExternalId("");
    setEvidence("");setAcknowledged(false);setError("");
  };
  const changeFilter=(next:ReviewPlatform|"all")=>{
    setPlatform(next);setOffset(0);reset();setMessage("");
  };
  const applySearch=()=>{
    setSearch(searchInput.trim().slice(0,80));setOffset(0);reset();setMessage("");
  };
  const choose=(id:number,next:Decision)=>{
    reset();setSelectedId(id);setDecision(next);setMessage("");
  };
  const navigate=(next:number)=>{
    setOffset(next);reset();setMessage("");
  };
  const submit=async(jobId:number)=>{
    if(!decision||!acknowledged||mutation.isPending)return;
    setError("");
    try{
      const proof=evidence.trim();
      if(proof.length<16)throw new Error("Mindestens 16 Zeichen Prüfgrundlage erforderlich.");
      if(decision==="confirmed_published"){
        if(!validManualReviewReceipt(externalId))
          throw new Error("Bitte eine echte Plattform-Beitrags-ID statt URL oder Platzhalter eingeben.");
        await mutation.mutateAsync({
          jobId,resolution:"confirmed_published",
          externalId:externalId.trim(),evidence:proof,
          confirmation:"VEROEFFENTLICHUNG_VERIFIZIERT",
        });
      }else{
        await mutation.mutateAsync({
          jobId,resolution:"closed_without_replay",evidence:proof,
          confirmation:"OHNE_WIEDERHOLUNG_SCHLIESSEN",
        });
      }
      reset();
      setMessage("Prüfentscheidung gespeichert. Kein automatischer Neuversand.");
      // When the last row of a later page has been resolved, show the
      // preceding page rather than a misleading empty state.
      if(jobs.length===1&&offset>0)setOffset(Math.max(0,offset-PAGE_SIZE));
      else await query.refetch();
    }catch(err){
      setError(err instanceof Error?err.message:"Prüfung fehlgeschlagen.");
      // A concurrent administrator may have changed the status.
      await query.refetch();
    }
  };
  return <View style={[styles.card,{backgroundColor:glassDepth.glass,borderColor:glassSurface.border}]}>
    <Text style={[styles.title,{color:glassSurface.textPrimary}]}>Versandprüfung</Text>
    <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
      Eine fehlende Plattform-Antwort bedeutet nicht automatisch einen Fehler beim Posten.
      Bitte zuerst direkt auf der Plattform prüfen. Ein Neuversand ist hier ausgeschlossen.
    </Text>

    <View style={styles.metrics}>
      <View style={styles.metric}>
        <Text style={[styles.metricValue,{color:glassSurface.textPrimary}]}>
          {query.data?.total??"–"}
        </Text>
        <Text style={[styles.meta,{color:glassSurface.textSecondary}]}>Ungeklärt gesamt</Text>
      </View>
      <View style={styles.metric}>
        <Text style={[styles.metricValue,{color:glassPalette.amber}]}>{query.data?.urgent??"–"}</Text>
        <Text style={[styles.meta,{color:glassSurface.textSecondary}]}>Über 1 Stunde</Text>
      </View>
      <View style={styles.metric}>
        <Text style={[styles.metricValue,{color:glassPalette.red}]}>{query.data?.critical??"–"}</Text>
        <Text style={[styles.meta,{color:glassSurface.textSecondary}]}>Über 24 Stunden</Text>
      </View>
    </View>

    <TextInput
      accessibilityLabel="Ungeklärte Veröffentlichungen nach Produkt oder Persona suchen"
      style={[styles.input,{borderColor:glassSurface.border,color:glassSurface.textPrimary}]}
      placeholder="Produkt oder Persona suchen"
      placeholderTextColor={glassSurface.textMuted}
      value={searchInput} onChangeText={setSearchInput} maxLength={80}
      returnKeyType="search" onSubmitEditing={applySearch}/>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Suche anwenden"
        onPress={applySearch} style={[styles.button,{borderColor:glassPalette.cyan}]}>
        <Text style={{color:glassPalette.cyan,fontWeight:"700"}}>Suchen</Text>
      </Pressable>
      {hasFilter?<Pressable accessibilityRole="button" accessibilityLabel="Alle Filter löschen"
        onPress={()=>{setSearchInput("");setSearch("");changeFilter("all");}}
        style={[styles.button,{borderColor:glassSurface.border}]}>
        <Text style={{color:glassSurface.textPrimary}}>Filter löschen</Text>
      </Pressable>:null}
    </View>
    <View style={styles.actions}>
      {(["all",...REVIEW_PLATFORMS] as Array<ReviewPlatform|"all">).map(id=>
        <Pressable key={id} accessibilityRole="button" accessibilityState={{selected:platform===id}}
          accessibilityLabel={id==="all"?"Alle Plattformen":`Plattform ${id}`}
          onPress={()=>changeFilter(id)}
          style={[styles.chip,{borderColor:platform===id?glassPalette.cyan:glassSurface.border}]}>
          <Text style={{color:platform===id?glassPalette.cyan:glassSurface.textSecondary,fontSize:11,fontWeight:"700"}}>
            {id==="all"?"Alle":id.toUpperCase()}
          </Text>
        </Pressable>)}
    </View>

    <View style={styles.header}>
      <Text style={[styles.count,{color:query.data?.total?glassPalette.amber:glassSurface.textSecondary}]}>
        {query.isLoading?"Lade Prüfliste…":query.error?"Prüfliste nicht verfügbar":
          `${query.data?.matching??0} Treffer · Älteste zuerst`}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Prüfliste aktualisieren"
        onPress={()=>void query.refetch()} disabled={query.isFetching}
        style={[styles.button,{borderColor:glassSurface.border}]}>
        <Text style={{color:glassPalette.cyan,fontWeight:"700"}}>Aktualisieren</Text>
      </Pressable>
    </View>
    {query.isFetching?<ActivityIndicator color={glassPalette.cyan}/>:null}
    {query.error?<Text style={[styles.warning,{color:glassPalette.red}]}>
      Prüfliste nicht abrufbar: {query.error.message}. Entscheidungen sind derzeit gesperrt.
    </Text>:null}
    {!query.isLoading&&!query.error&&jobs.length===0?
      <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
        {hasFilter?"Für diese Filter wurden keine Vorgänge gefunden.":
          "Keine ungeklärten Veröffentlichungen für dieses Administratorkonto."}
      </Text>:null}

    {!query.error&&jobs.map(job=>{
      const urgency=reviewUrgency(job.updatedAt);
      const providerUrl=reviewPlatformHome(job.platform);
      return <View key={job.id} style={[styles.job,{borderColor:glassSurface.border}]}>
        <Text style={[styles.jobTitle,{color:glassSurface.textPrimary}]}>
          #{job.id} · {job.platform.toUpperCase()} · {job.persona}
        </Text>
        <Text style={[styles.meta,{color:glassSurface.textSecondary}]} numberOfLines={2}>{job.product}</Text>
        <Text style={[styles.warning,{color:urgency==="critical"?glassPalette.red:glassPalette.amber}]}>
          {reviewAgeLabel(job.updatedAt)}
          {urgency==="critical"?" · KRITISCH":urgency==="urgent"?" · DRINGEND":""}
          {" · "}{job.attempts} Versandversuch(e)
        </Text>
        {job.lastError?<Text numberOfLines={3}
          style={[styles.meta,{color:glassSurface.textSecondary}]}>
          Letzter Status: {job.lastError}
        </Text>:null}
        {providerUrl?<Pressable accessibilityRole="link"
          accessibilityLabel={`Offizielle Plattform ${job.platform} zur Sichtprüfung öffnen`}
          style={[styles.button,{borderColor:glassPalette.cyan}]}
          onPress={()=>void Linking.openURL(providerUrl).catch(()=>{
            setError("Plattform ließ sich nicht öffnen; bitte manuell aufrufen.");
          })}>
          <Text style={{color:glassPalette.cyan,fontWeight:"700"}}>
            Plattform zur Prüfung öffnen
          </Text>
        </Pressable>:null}
        {selectedId!==job.id?
          <View style={styles.actions}>
            <Pressable accessibilityRole="button"
              accessibilityLabel={`Beitrag zu Job ${job.id} mit externer ID bestätigen`}
              onPress={()=>choose(job.id,"confirmed_published")}
              style={[styles.button,{borderColor:glassPalette.cyan}]}>
              <Text style={{color:glassPalette.cyan,fontWeight:"700"}}>Beitrag gefunden</Text>
            </Pressable>
            <Pressable accessibilityRole="button"
              accessibilityLabel={`Job ${job.id} ohne Neuversand schließen`}
              onPress={()=>choose(job.id,"closed_without_replay")}
              style={[styles.button,{borderColor:glassSurface.border}]}>
              <Text style={{color:glassSurface.textPrimary,fontWeight:"700"}}>Ohne Neuversand schließen</Text>
            </Pressable>
          </View>
        :<>
          <Text style={[styles.warning,{color:glassPalette.amber}]}>
            {decision==="confirmed_published"?
              "Nur bestätigen, wenn dieser Beitrag wirklich auf der Plattform sichtbar ist.":
              "Der Vorgang wird dauerhaft geschlossen. Es erfolgt kein erneuter Versand."}
          </Text>
          {decision==="confirmed_published"?
            <TextInput accessibilityLabel="Verifizierte Beitrags-ID ohne URL" value={externalId}
              onChangeText={setExternalId} autoCapitalize="none" autoCorrect={false}
              maxLength={300} placeholder="Exakte Beitrags-ID (keine URL)"
              placeholderTextColor={glassSurface.textMuted}
              style={[styles.input,{color:glassSurface.textPrimary,borderColor:glassSurface.border}]}/>:null}
          <TextInput accessibilityLabel="Schriftliche Prüfgrundlage" value={evidence}
            onChangeText={setEvidence} multiline maxLength={1200}
            placeholder="Wo und wann geprüft? Welcher Post oder welches Ergebnis?"
            placeholderTextColor={glassSurface.textMuted}
            style={[styles.input,{color:glassSurface.textPrimary,borderColor:glassSurface.border,minHeight:80}]}/>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked:acknowledged}}
            accessibilityLabel="Ich habe den Plattformstatus geprüft und bestätige diese verbindliche Entscheidung"
            onPress={()=>setAcknowledged(v=>!v)}
            style={styles.checkboxRow}>
            <Text style={{color:glassPalette.cyan,fontSize:20}}>
              {acknowledged?"☑":"☐"}
            </Text>
            <Text style={[styles.hint,{color:glassSurface.textPrimary,flex:1}]}>
              Plattformstatus selbst geprüft; Entscheidung ohne Neuversand bestätigen
            </Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Prüfung abbrechen"
              onPress={reset} style={[styles.button,{borderColor:glassSurface.border}]}>
              <Text style={{color:glassSurface.textSecondary}}>Abbrechen</Text>
            </Pressable>
            <Pressable accessibilityRole="button"
              accessibilityLabel="Prüfentscheidung endgültig speichern"
              disabled={mutation.isPending||!acknowledged||evidence.trim().length<16||
                (decision==="confirmed_published"&&!validManualReviewReceipt(externalId))}
              onPress={()=>void submit(job.id)}
              style={[styles.confirm,{backgroundColor:glassPalette.amber,
                opacity:mutation.isPending||!acknowledged?0.5:1}]}>
              <Text style={{color:glassDepth.void,fontWeight:"800"}}>
                {mutation.isPending?"Speichere…":"Verbindlich abschließen"}
              </Text>
            </Pressable>
          </View>
        </>}
      </View>;
    })}

    {query.data&&query.data.matching>PAGE_SIZE?<View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Vorherige Prüflistenseite"
        disabled={offset===0} onPress={()=>navigate(Math.max(0,offset-PAGE_SIZE))}
        style={[styles.button,{borderColor:glassSurface.border}]}>
        <Text style={{color:offset===0?glassSurface.textMuted:glassPalette.cyan}}>Zurück</Text>
      </Pressable>
      <Text style={[styles.meta,{color:glassSurface.textSecondary}]}>
        {Math.min(offset+1,query.data.matching)}–{Math.min(offset+PAGE_SIZE,query.data.matching)}
        {" / "}{query.data.matching}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Nächste Prüflistenseite"
        disabled={!query.data.hasMore} onPress={()=>navigate(offset+PAGE_SIZE)}
        style={[styles.button,{borderColor:glassSurface.border}]}>
        <Text style={{color:query.data.hasMore?glassPalette.cyan:glassSurface.textMuted}}>Weiter</Text>
      </Pressable>
    </View>:null}
    {error?<Text style={{color:glassPalette.red}}>{error}</Text>:null}
    {message?<Text accessibilityRole="alert" style={{color:glassPalette.green}}>{message}</Text>:null}
    {query.data?.events?.length?<View style={styles.audit}>
      <Text style={[styles.title,{color:glassSurface.textPrimary}]}>Prüfchronik (letzte 5)</Text>
      {query.data.events.slice(0,5).map(event=><View key={event.id}
        style={{borderTopWidth:1,borderColor:glassSurface.border,paddingTop:6}}>
        <Text style={[styles.meta,{color:glassSurface.textPrimary}]}>
          #{event.jobId} · {event.resolution==="confirmed_published"?
            "Veröffentlichung bestätigt":"Ohne Neuversand geschlossen"}
          {" · "}{new Date(event.reviewedAt).toLocaleString("de-DE")}
        </Text>
        <Text style={[styles.meta,{color:glassSurface.textSecondary}]} numberOfLines={3}>
          {event.evidence}
        </Text>
      </View>)}
    </View>:null}
  </View>;
}

const styles=StyleSheet.create({
  card:{borderWidth:1,borderRadius:14,padding:14,gap:12},
  title:{fontSize:15,fontWeight:"800"},
  hint:{fontSize:12,lineHeight:18},
  metrics:{flexDirection:"row",flexWrap:"wrap",gap:8},
  metric:{flexGrow:1,minWidth:83,borderRadius:9,padding:10,backgroundColor:glassDepth.layer,gap:4},
  metricValue:{fontSize:20,fontWeight:"800"},
  header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
  count:{fontSize:13,fontWeight:"800",flex:1},
  job:{borderWidth:1,borderRadius:11,padding:12,gap:8},
  jobTitle:{fontSize:13,fontWeight:"800"},
  meta:{fontSize:11,lineHeight:17},
  warning:{fontSize:12,fontWeight:"700",lineHeight:18},
  actions:{flexDirection:"row",flexWrap:"wrap",gap:8},
  button:{borderWidth:1,borderRadius:8,paddingVertical:10,paddingHorizontal:12,minHeight:42,justifyContent:"center"},
  chip:{borderWidth:1,borderRadius:8,paddingVertical:8,paddingHorizontal:10,minHeight:36},
  confirm:{borderRadius:8,paddingVertical:10,paddingHorizontal:12,minHeight:42,justifyContent:"center"},
  input:{borderWidth:1,borderRadius:8,padding:10,fontSize:13,minHeight:44},
  checkboxRow:{flexDirection:"row",alignItems:"center",gap:10,minHeight:50},
  audit:{gap:8},
});
