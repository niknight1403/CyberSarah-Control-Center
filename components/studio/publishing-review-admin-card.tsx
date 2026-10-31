/**
 * Admin-only, mobile-first manual reconciliation. A selection requires an
 * explicit second confirmation; no UI path ever dispatches an external post.
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";

type Decision="confirmed_published"|"closed_without_replay";

export function PublishingReviewAdminCard({isAdmin}:{isAdmin:boolean}) {
  const query=trpc.publishing.reviewQueue.useQuery(undefined,{
    enabled:isAdmin, retry:false, refetchInterval:30_000,
  });
  const mutation=trpc.publishing.reconcile.useMutation();
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [decision,setDecision]=useState<Decision|null>(null);
  const [externalId,setExternalId]=useState("");
  const [evidence,setEvidence]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  if(!isAdmin) return null;
  const jobs=query.data?.jobs??[];
  const reset=()=>{setSelectedId(null);setDecision(null);setExternalId("");setEvidence("");setError("");};
  const choose=(id:number,next:Decision)=>{
    setSelectedId(id);setDecision(next);setExternalId("");setEvidence("");setError("");setMessage("");
  };
  const submit=async(jobId:number)=>{
    if(!decision)return;
    setError("");
    try{
      const evidenceValue=evidence.trim();
      if(evidenceValue.length<16)throw new Error("Prüfgrundlage mit mindestens 16 Zeichen erforderlich.");
      if(decision==="confirmed_published"){
        if(externalId.trim().length<4)throw new Error("Bitte eine überprüfte Plattform-Beitrags-ID angeben.");
        await mutation.mutateAsync({
          jobId, resolution:decision, externalId:externalId.trim(), evidence:evidenceValue,
          confirmation:"VEROEFFENTLICHUNG_VERIFIZIERT",
        });
      }else{
        await mutation.mutateAsync({
          jobId, resolution:decision, evidence:evidenceValue,
          confirmation:"OHNE_WIEDERHOLUNG_SCHLIESSEN",
        });
      }
      reset();
      setMessage("Entscheidung gespeichert. Der Beitrag wird nicht erneut gesendet.");
      await query.refetch();
    }catch(err){setError(err instanceof Error?err.message:"Prüfung fehlgeschlagen.");}
  };
  return (
    <View style={[styles.card,{backgroundColor:glassDepth.glass,borderColor:glassSurface.border}]}>
      <Text style={[styles.title,{color:glassSurface.textPrimary}]}>Versandprüfung</Text>
      <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>
        Bei fehlender Plattform-Antwort ist nicht bekannt, ob bereits gepostet wurde.
        Prüfe den Beitrag direkt auf der Plattform. Hier gibt es bewusst keinen Wiederholen-Button.
      </Text>
      <View style={styles.header}>
        <Text style={[styles.count,{color:jobs.length?glassPalette.amber:glassPalette.green}]}>
          {query.isLoading?"Lade Prüfungen…":`${jobs.length} offene Vorgänge`}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Prüfliste aktualisieren"
          onPress={()=>void query.refetch()} disabled={query.isFetching}
          style={[styles.smallButton,{borderColor:glassSurface.border}]}>
          <Text style={{color:glassPalette.cyan,fontWeight:"700"}}>Aktualisieren</Text>
        </Pressable>
      </View>
      {query.isFetching?<ActivityIndicator color={glassPalette.cyan}/>:null}
      {query.error?<Text style={{color:glassPalette.red}}>Prüfliste nicht abrufbar: {query.error.message}</Text>:null}
      {!query.isLoading&&!query.error&&jobs.length===0?
        <Text style={[styles.hint,{color:glassSurface.textSecondary}]}>Keine ungeklärten Veröffentlichungen für dieses Administratorkonto.</Text>:null}
      {jobs.map(job=>(
        <View key={job.id} style={[styles.job,{borderColor:glassSurface.border}]}>
          <Text style={[styles.jobTitle,{color:glassSurface.textPrimary}]}>
            #{job.id} · {job.platform.toUpperCase()} · {job.persona}
          </Text>
          <Text style={[styles.meta,{color:glassSurface.textSecondary}]} numberOfLines={2}>{job.product}</Text>
          <Text style={[styles.meta,{color:glassSurface.textSecondary}]}>
            Letzte Änderung: {new Date(job.updatedAt).toLocaleString("de-DE")} · Versuch {job.attempts}
          </Text>
          <Text style={[styles.warning,{color:glassPalette.amber}]}>Status ungeklärt – kein automatischer Neuversand</Text>
          {selectedId!==job.id?
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Job ${job.id} als veröffentlicht prüfen`}
                style={[styles.smallButton,{borderColor:glassPalette.cyan}]}
                onPress={()=>choose(job.id,"confirmed_published")}>
                <Text style={{color:glassPalette.cyan,fontWeight:"700"}}>Beitrag gefunden</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Job ${job.id} ohne Wiederholung schließen`}
                style={[styles.smallButton,{borderColor:glassSurface.border}]}
                onPress={()=>choose(job.id,"closed_without_replay")}>
                <Text style={{color:glassSurface.textPrimary,fontWeight:"700"}}>Ohne Neuversand schließen</Text>
              </Pressable>
            </View>
          :<>
            <Text style={[styles.warning,{color:glassPalette.amber}]}>
              {decision==="confirmed_published"?
                "Bestätige nur nach Sichtprüfung des echten Plattform-Beitrags.":
                "Schließt den Vorgang dauerhaft, auch wenn kein Beitrag gefunden wurde. Kein automatischer Retry."}
            </Text>
            {decision==="confirmed_published"?
              <TextInput accessibilityLabel="Verifizierte externe Beitrags-ID" value={externalId}
                onChangeText={setExternalId} autoCapitalize="none" autoCorrect={false}
                placeholder="Plattform-Beitrags-ID" placeholderTextColor={glassSurface.textMuted}
                style={[styles.input,{color:glassSurface.textPrimary,borderColor:glassSurface.border}]}/>:null}
            <TextInput accessibilityLabel="Prüfgrundlage" value={evidence} multiline
              onChangeText={setEvidence} maxLength={1200}
              placeholder="Wo, wann und wie wurde auf der Plattform geprüft? (mind. 16 Zeichen)"
              placeholderTextColor={glassSurface.textMuted}
              style={[styles.input,{color:glassSurface.textPrimary,borderColor:glassSurface.border}]}/>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Prüfung abbrechen"
                style={[styles.smallButton,{borderColor:glassSurface.border}]} onPress={reset}>
                <Text style={{color:glassSurface.textSecondary}}>Abbrechen</Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                accessibilityLabel="Verbindliche Prüfentscheidung bestätigen"
                disabled={mutation.isPending||evidence.trim().length<16||(decision==="confirmed_published"&&externalId.trim().length<4)}
                style={[styles.confirm,{backgroundColor:glassPalette.amber,opacity:mutation.isPending?0.5:1}]}
                onPress={()=>void submit(job.id)}>
                <Text style={{color:glassDepth.void,fontWeight:"800"}}>{mutation.isPending?"Speichere…":"Entscheidung verbindlich speichern"}</Text>
              </Pressable>
            </View>
          </>}
        </View>
      ))}
      {error?<Text style={{color:glassPalette.red}}>{error}</Text>:null}
      {message?<Text style={{color:glassPalette.green}}>{message}</Text>:null}
      {query.data?.events?.length?
        <View style={{gap:6}}>
          <Text style={[styles.title,{color:glassSurface.textPrimary}]}>Letzte Prüfentscheidungen</Text>
          {query.data.events.slice(0,5).map(event=>(
            <Text key={event.id} style={[styles.meta,{color:glassSurface.textSecondary}]}>
              #{event.jobId} · {event.resolution==="confirmed_published"?"Plattform-Beitrag bestätigt":"Ohne Neuversand geschlossen"}
              {" · "}{new Date(event.reviewedAt).toLocaleString("de-DE")}
              {" · "}{event.evidence}
            </Text>
          ))}
        </View>:null}
    </View>
  );
}

const styles=StyleSheet.create({
  card:{borderWidth:1,borderRadius:14,padding:14,gap:12},
  title:{fontSize:15,fontWeight:"800"},
  hint:{fontSize:12,lineHeight:18},
  header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
  count:{fontSize:13,fontWeight:"800"},
  job:{borderWidth:1,borderRadius:11,padding:12,gap:8},
  jobTitle:{fontSize:13,fontWeight:"800"},
  meta:{fontSize:11,lineHeight:17},
  warning:{fontSize:12,fontWeight:"700",lineHeight:17},
  actions:{flexDirection:"row",flexWrap:"wrap",gap:8},
  smallButton:{borderWidth:1,borderRadius:8,paddingVertical:8,paddingHorizontal:10},
  confirm:{borderRadius:8,paddingVertical:9,paddingHorizontal:10},
  input:{borderWidth:1,borderRadius:8,padding:10,fontSize:13,minHeight:42},
});
