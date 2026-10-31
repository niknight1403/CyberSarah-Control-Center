/** Read-only mobile review audit explorer; never retries or edits publishing jobs. */
import {useState} from "react";
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from "react-native";
import {trpc} from "@/lib/trpc";
import {glassDepth,glassPalette,glassSurface} from "@/lib/design/future-glass";
type Resolution="confirmed_published"|"closed_without_replay";
const PAGE_SIZE=10;

export function PublishingAuditAdminCard({isAdmin}:{isAdmin:boolean}){
  const [offset,setOffset]=useState(0);
  const [resolution,setResolution]=useState<Resolution|"all">("all");
  const [jobDraft,setJobDraft]=useState("");
  const [jobId,setJobId]=useState<number|undefined>();
  const [startDraft,setStartDraft]=useState("");
  const [endDraft,setEndDraft]=useState("");
  const [from,setFrom]=useState<Date|undefined>();
  const [until,setUntil]=useState<Date|undefined>();
  const [error,setError]=useState("");
  const [expanded,setExpanded]=useState<number|null>(null);
  const query=trpc.publishing.reviewAudit.useQuery({
    limit:PAGE_SIZE,offset,
    resolution:resolution==="all"?undefined:resolution,
    jobId,from,until,
  },{enabled:isAdmin,retry:false,refetchInterval:60_000});
  if(!isAdmin)return null;
  const apply=()=>{
    const id=jobDraft.trim();
    if(id&&!/^[1-9][0-9]{0,9}$/.test(id)){
      setError("Job-ID muss eine positive Ganzzahl sein.");return;
    }
    const parseDate=(v:string,end:boolean):Date|undefined=>{
      if(!v.trim())return undefined;
      if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(v.trim()))throw Error("Datum als JJJJ-MM-TT eingeben.");
      const parsed=new Date(v.trim()+(end?"T23:59:59.999Z":"T00:00:00.000Z"));
      if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==v.trim())
        throw Error("Ungültiges Kalenderdatum.");
      return parsed;
    };
    try{
      const nextFrom=parseDate(startDraft,false),nextUntil=parseDate(endDraft,true);
      if(nextFrom&&nextUntil&&nextFrom>nextUntil)throw Error("Startdatum muss vor dem Enddatum liegen.");
      setFrom(nextFrom);setUntil(nextUntil);
      setJobId(id?Number(id):undefined);setOffset(0);setExpanded(null);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Ungültiger Filter.");}
  };
  const clear=()=>{
    setJobDraft("");setJobId(undefined);setStartDraft("");setEndDraft("");
    setFrom(undefined);setUntil(undefined);setResolution("all");setOffset(0);
    setExpanded(null);setError("");
  };
  return <View style={[styles.card,{backgroundColor:glassDepth.glass,borderColor:glassSurface.border}]}>
    <Text style={[styles.title,{color:glassSurface.textPrimary}]}>Prüfchronik & Nachweise</Text>
    <Text style={[styles.meta,{color:glassSurface.textSecondary}]}>
      Schreibgeschütztes Protokoll der Admin-Entscheidungen. Nur für dein Konto.
      Keine erneuten Veröffentlichungen oder Änderungen aus diesem Bereich.
    </Text>
    <View style={styles.actions}>
      {(["all","confirmed_published","closed_without_replay"] as const).map(value=>
        <Pressable key={value} accessibilityRole="button"
          accessibilityState={{selected:resolution===value}}
          onPress={()=>{setResolution(value);setOffset(0);setExpanded(null);}}
          style={[styles.button,{borderColor:resolution===value?glassPalette.cyan:glassSurface.border}]}>
          <Text style={{fontSize:11,color:resolution===value?glassPalette.cyan:glassSurface.textPrimary}}>
            {value==="all"?"Alle":value==="confirmed_published"?"Bestätigt":"Geschlossen"}
          </Text>
        </Pressable>)}
    </View>
    <TextInput accessibilityLabel="Nach Job-ID filtern" keyboardType="numeric"
      placeholder="Job-ID (optional)" placeholderTextColor={glassSurface.textMuted}
      value={jobDraft} onChangeText={setJobDraft}
      style={[styles.input,{borderColor:glassSurface.border,color:glassSurface.textPrimary}]}/>
    <View style={styles.actions}>
      <TextInput accessibilityLabel="Startdatum UTC" placeholder="Von: JJJJ-MM-TT (UTC)"
        placeholderTextColor={glassSurface.textMuted} value={startDraft}
        onChangeText={setStartDraft} style={[styles.input,{flex:1,minWidth:120,borderColor:glassSurface.border,color:glassSurface.textPrimary}]}/>
      <TextInput accessibilityLabel="Enddatum UTC" placeholder="Bis: JJJJ-MM-TT (UTC)"
        placeholderTextColor={glassSurface.textMuted} value={endDraft}
        onChangeText={setEndDraft} style={[styles.input,{flex:1,minWidth:120,borderColor:glassSurface.border,color:glassSurface.textPrimary}]}/>
    </View>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={apply}
        style={[styles.button,{borderColor:glassPalette.cyan}]}>
        <Text style={{color:glassPalette.cyan,fontWeight:"700"}}>Filter anwenden</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={clear}
        style={[styles.button,{borderColor:glassSurface.border}]}>
        <Text style={{color:glassSurface.textPrimary}}>Zurücksetzen</Text>
      </Pressable>
    </View>
    {error?<Text style={{color:glassPalette.red}}>{error}</Text>:null}
    {query.isFetching?<ActivityIndicator color={glassPalette.cyan}/>:null}
    {query.error?<Text style={{color:glassPalette.red}}>
      Prüfchronik nicht verfügbar: {query.error.message}
    </Text>:null}
    {query.data&&!query.error?<>
      <Text style={[styles.meta,{color:glassSurface.textPrimary}]}>
        {query.data.total} Einträge · Neuste zuerst
      </Text>
      {query.data.events.length===0?<Text style={[styles.meta,{color:glassSurface.textSecondary}]}>
        Keine Prüfentscheidungen für diese Filter gefunden.
      </Text>:null}
      {query.data.events.map(e=><View key={e.id} style={[styles.entry,{borderColor:glassSurface.border}]}>
        <Text style={[styles.title,{color:glassSurface.textPrimary}]}>
          #{e.jobId} · {e.resolution==="confirmed_published"?"Veröffentlichung bestätigt":"Ohne Neuversand geschlossen"}
        </Text>
        <Text style={[styles.meta,{color:glassSurface.textSecondary}]}>
          {new Date(e.reviewedAt).toLocaleString("de-DE")} · Prüf-ID {e.id}
        </Text>
        <Pressable accessibilityRole="button"
          accessibilityLabel={expanded===e.id?"Prüfgrundlage einklappen":"Vollständige Prüfgrundlage anzeigen"}
          onPress={()=>setExpanded(expanded===e.id?null:e.id)}
          style={[styles.button,{borderColor:glassSurface.border}]}>
          <Text style={{color:glassPalette.cyan}}>
            {expanded===e.id?"Details schließen":"Prüfgrundlage ansehen"}
          </Text>
        </Pressable>
        {expanded===e.id?<View style={{gap:5}}>
          <Text selectable style={[styles.meta,{color:glassSurface.textPrimary}]}>
            {e.evidence}
          </Text>
          {e.externalId?<Text selectable style={[styles.meta,{color:glassSurface.textSecondary}]}>
            Beitrags-ID: {e.externalId}
          </Text>:null}
          <Text style={[styles.meta,{color:glassSurface.textSecondary}]}>
            Bearbeiter-ID: {e.actorOpenId}
          </Text>
        </View>:null}
      </View>)}
      <View style={[styles.actions,{justifyContent:"space-between",alignItems:"center"}]}>
        <Pressable accessibilityRole="button" disabled={offset===0}
          onPress={()=>{setOffset(Math.max(0,offset-PAGE_SIZE));setExpanded(null);}}
          style={[styles.button,{borderColor:glassSurface.border}]}>
          <Text style={{color:offset?glassPalette.cyan:glassSurface.textMuted}}>Zurück</Text>
        </Pressable>
        <Text style={[styles.meta,{color:glassSurface.textSecondary}]}>
          {query.data.total?offset+1:0}–{Math.min(offset+PAGE_SIZE,query.data.total)}
        </Text>
        <Pressable accessibilityRole="button" disabled={!query.data.hasMore}
          onPress={()=>{setOffset(offset+PAGE_SIZE);setExpanded(null);}}
          style={[styles.button,{borderColor:glassSurface.border}]}>
          <Text style={{color:query.data.hasMore?glassPalette.cyan:glassSurface.textMuted}}>Weiter</Text>
        </Pressable>
      </View>
    </>:null}
  </View>;
}
const styles=StyleSheet.create({
  card:{borderWidth:1,borderRadius:14,padding:14,gap:12},
  title:{fontSize:14,fontWeight:"800"},meta:{fontSize:12,lineHeight:18},
  actions:{flexDirection:"row",flexWrap:"wrap",gap:8},
  button:{borderWidth:1,borderRadius:8,paddingHorizontal:12,paddingVertical:10,minHeight:42,justifyContent:"center"},
  input:{borderWidth:1,borderRadius:8,padding:10,fontSize:12,minHeight:44},
  entry:{borderWidth:1,borderRadius:9,padding:10,gap:6},
});
