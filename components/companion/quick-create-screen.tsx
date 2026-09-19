import { useMemo, useState } from "react";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const stylesOptions = ["Realistisch", "Anime", "3D"];
const hairOptions = ["Silber", "Schwarz", "Kastanie"];
const eyeOptions = ["Violett", "Smaragd", "Amber"];
const outfits = ["Midnight blazer", "Soft knitwear", "Neon streetwear"];
const traits = ["Süß", "Frech", "Intelligent", "Energisch"];
const tones = ["Locker", "Vertraut", "Direkt"];

export function QuickCreateScreen() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("Sarah");
  const [visualStyle, setVisualStyle] = useState("Realistisch");
  const [hair, setHair] = useState("Silber");
  const [eyes, setEyes] = useState("Violett");
  const [outfit, setOutfit] = useState("Midnight blazer");
  const [selectedTraits, setSelectedTraits] = useState(["Süß", "Intelligent"]);
  const [relationship, setRelationship] = useState("Feste Freundin");
  const [tone, setTone] = useState("Vertraut");
  const [language, setLanguage] = useState("Deutsch");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string[]>([]);

  const systemPrompt = useMemo(() => `Du bist ${name}, eine virtuelle Begleiterin. Beziehung: ${relationship}. Persönlichkeit: ${selectedTraits.join(", ")}. Stil: ${visualStyle}, ${hair} Haare, ${eyes} Augen, ${outfit}. Sprache: ${language}. Tonalität: ${tone}. Nutze *Sternchen* für Gestik und Aktionen, stelle Gegenfragen und bleibe warm, aufmerksam und konsistent.`, [name, relationship, selectedTraits, visualStyle, hair, eyes, outfit, language, tone]);

  const toggleTrait = (trait: string) => setSelectedTraits((current) => current.includes(trait) ? current.filter((item) => item !== trait) : [...current, trait]);
  const sendMessage = () => { if (!message.trim()) return; setSent((current) => [...current, message.trim()]); setMessage(""); };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.shell}>
        <View style={styles.topbar}>
          <View><Text style={styles.eyebrow}>COMPANION STUDIO / QUICK CREATE</Text><Text style={styles.title}>Baue deine Begleiterin.</Text></View>
          <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>AI ENGINE ONLINE</Text></View>
        </View>
        <View style={styles.main}>
          <ScrollView style={styles.creator} contentContainerStyle={styles.creatorContent} showsVerticalScrollIndicator={false}>
            <View style={styles.stepper}>{[1, 2, 3].map((item) => <Pressable key={item} onPress={() => setStep(item)} style={[styles.step, step === item && styles.stepActive]}><Text style={[styles.stepNumber, step === item && styles.stepNumberActive]}>0{item}</Text><Text style={[styles.stepLabel, step === item && styles.stepLabelActive]}>{["Look", "Charakter", "Stimme"][item - 1]}</Text></Pressable>)}</View>
            {step === 1 && <>
              <SectionTitle eyebrow="01 / VISUELLER STIL" title="Wie soll sie aussehen?" />
              <FieldLabel label="NAME" /><TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor="#71809b" />
              <FieldLabel label="DARSTELLUNG" /><OptionGrid options={stylesOptions} selected={visualStyle} onSelect={setVisualStyle} icons={["◉", "✦", "◇"]} />
              <FieldLabel label="DETAILS" /><Text style={styles.miniLabel}>HAARE</Text><OptionGrid options={hairOptions} selected={hair} onSelect={setHair} /><Text style={styles.miniLabel}>AUGEN</Text><OptionGrid options={eyeOptions} selected={eyes} onSelect={setEyes} /><Text style={styles.miniLabel}>OUTFIT</Text><OptionGrid options={outfits} selected={outfit} onSelect={setOutfit} />
            </>}
            {step === 2 && <>
              <SectionTitle eyebrow="02 / PERSÖNLICHKEIT" title="Was macht sie aus?" />
              <FieldLabel label="EIGENSCHAFTEN" /><View style={styles.chipWrap}>{traits.map((trait) => <Pressable key={trait} onPress={() => toggleTrait(trait)} style={[styles.chip, selectedTraits.includes(trait) && styles.chipActive]}><Text style={[styles.chipText, selectedTraits.includes(trait) && styles.chipTextActive]}>{trait}</Text></Pressable>)}</View>
              <FieldLabel label="BEZIEHUNGSMODUS" /><OptionGrid options={["Feste Freundin", "Flirt-Partnerin", "Beste Freundin", "Mentorin"]} selected={relationship} onSelect={setRelationship} />
              <View style={styles.tip}><Ionicons name="sparkles-outline" size={16} color="#b58cff" /><Text style={styles.tipText}>Du kannst ihre Persönlichkeit später im Chat weiterentwickeln.</Text></View>
            </>}
            {step === 3 && <>
              <SectionTitle eyebrow="03 / STIMME & TONALITÄT" title="Wie soll sie mit dir sprechen?" />
              <FieldLabel label="TONFALL" /><OptionGrid options={tones} selected={tone} onSelect={setTone} /><FieldLabel label="SPRACHE" /><OptionGrid options={["Deutsch", "English", "Français"]} selected={language} onSelect={setLanguage} />
              <View style={styles.promptBox}><Text style={styles.promptLabel}>GENERIERTER SYSTEM-PROMPT</Text><Text style={styles.promptText} numberOfLines={7}>{systemPrompt}</Text></View>
            </>}
            <View style={styles.footer}><Pressable disabled={step === 1} onPress={() => setStep((current) => current - 1)} style={[styles.secondaryButton, step === 1 && styles.disabled]}><Text style={styles.secondaryText}>Zurück</Text></Pressable><Pressable onPress={() => setStep((current) => current === 3 ? 1 : current + 1)} style={styles.primaryButton}><Text style={styles.primaryText}>{step === 3 ? "Begleiterin starten" : "Weiter"}</Text><Ionicons name="arrow-forward" size={16} color="#0b0f19" /></Pressable></View>
          </ScrollView>
          <View style={styles.preview}>
            <View style={styles.previewHeader}><Text style={styles.previewEyebrow}>LIVE PREVIEW</Text><View style={styles.previewBadge}><View style={styles.liveDot} /><Text style={styles.badgeText}>READY</Text></View></View>
            <View style={styles.profileCard}><View style={styles.avatarFrame}><Image source={require("../../assets/images/sarah-avatar.png")} style={styles.avatar} contentFit="cover" /><View style={styles.avatarGlow} /></View><Text style={styles.profileName}>{name || "Sarah"}</Text><Text style={styles.profileMeta}>{relationship} · {visualStyle}</Text><View style={styles.tagRow}>{selectedTraits.slice(0, 3).map((trait) => <View key={trait} style={styles.profileTag}><Text style={styles.profileTagText}>{trait}</Text></View>)}</View><View style={styles.profileLine} /><Text style={styles.profileSection}>CHARACTER DNA</Text><View style={styles.dnaRow}><Text style={styles.dnaLabel}>Warmth</Text><View style={styles.dnaTrack}><View style={[styles.dnaFill, { width: "88%" }]} /></View></View><View style={styles.dnaRow}><Text style={styles.dnaLabel}>Energy</Text><View style={styles.dnaTrack}><View style={[styles.dnaFill, { width: "64%" }]} /></View></View></View>
            <View style={styles.chatCard}><View style={styles.chatHeader}><View style={styles.smallAvatar}><Image source={require("../../assets/images/sarah-avatar.png")} style={styles.smallAvatarImage} /></View><View><Text style={styles.chatName}>{name || "Sarah"}</Text><Text style={styles.chatStatus}>schreibt dir gerade</Text></View><Ionicons name="ellipsis-horizontal" size={18} color="#71809b" style={styles.chatMore} /></View><ScrollView style={styles.messages} showsVerticalScrollIndicator={false}><View style={styles.bubble}><Text style={styles.bubbleText}>*lächelt dich an* Hey, schön dass du da bist. Ich bin bereit, dich kennenzulernen.</Text></View>{sent.map((item, index) => <View key={`${item}-${index}`} style={styles.userBubble}><Text style={styles.userBubbleText}>{item}</Text></View>)}<View style={styles.bubble}><Text style={styles.bubbleText}>Was beschäftigt dich gerade?</Text></View></ScrollView><View style={styles.composer}><TextInput value={message} onChangeText={setMessage} onSubmitEditing={sendMessage} placeholder="Schreib eine Nachricht …" placeholderTextColor="#71809b" style={styles.composerInput} /><Pressable onPress={sendMessage} style={styles.sendButton}><Ionicons name="arrow-up" size={17} color="#0b0f19" /></Pressable></View></View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) { return <View style={styles.sectionTitle}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.sectionHeading}>{title}</Text></View>; }
function FieldLabel({ label }: { label: string }) { return <Text style={styles.fieldLabel}>{label}</Text>; }
function OptionGrid({ options, selected, onSelect, icons }: { options: string[]; selected: string; onSelect: (value: string) => void; icons?: string[] }) { return <View style={styles.optionGrid}>{options.map((option, index) => <Pressable key={option} onPress={() => onSelect(option)} style={[styles.option, selected === option && styles.optionActive]}><Text style={[styles.optionIcon, selected === option && styles.optionIconActive]}>{icons?.[index]}</Text><Text style={[styles.optionText, selected === option && styles.optionTextActive]}>{option}</Text>{selected === option && <Ionicons name="checkmark" size={15} color="#b58cff" />}</Pressable>)}</View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#090c13" }, shell: { flex: 1, maxWidth: 1440, alignSelf: "center", width: "100%" }, topbar: { paddingHorizontal: 28, paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: "#1b2434", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, eyebrow: { color: "#71809b", fontSize: 10, letterSpacing: 2, fontWeight: "800" }, title: { color: "#f4f3f9", fontSize: 25, fontWeight: "800", marginTop: 7, letterSpacing: -0.8 }, live: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: "#283449", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#76e3b5" }, liveText: { color: "#9aa8bf", fontSize: 9, letterSpacing: 1, fontWeight: "800" }, main: { flex: 1, flexDirection: "row" }, creator: { flex: 1, maxWidth: 660, borderRightWidth: 1, borderRightColor: "#1b2434" }, creatorContent: { padding: 28, paddingBottom: 40 }, stepper: { flexDirection: "row", gap: 24, marginBottom: 34 }, step: { flexDirection: "row", alignItems: "center", gap: 9, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: "transparent" }, stepActive: { borderBottomColor: "#b58cff" }, stepNumber: { color: "#53617a", fontSize: 11, fontWeight: "800" }, stepNumberActive: { color: "#b58cff" }, stepLabel: { color: "#53617a", fontSize: 12, fontWeight: "700" }, stepLabelActive: { color: "#f4f3f9" }, sectionTitle: { marginBottom: 25 }, sectionHeading: { color: "#f4f3f9", fontSize: 24, fontWeight: "800", marginTop: 6, letterSpacing: -0.7 }, fieldLabel: { color: "#71809b", fontSize: 10, letterSpacing: 1.3, fontWeight: "800", marginBottom: 9, marginTop: 20 }, miniLabel: { color: "#53617a", fontSize: 9, letterSpacing: 1, marginBottom: 7, marginTop: 16 }, input: { backgroundColor: "#101621", borderWidth: 1, borderColor: "#283449", borderRadius: 10, color: "#f4f3f9", paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }, optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, option: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#101621", borderWidth: 1, borderColor: "#202c40", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, minWidth: 112 }, optionActive: { borderColor: "#8a66c8", backgroundColor: "#171528" }, optionIcon: { color: "#71809b", fontSize: 13 }, optionIconActive: { color: "#b58cff" }, optionText: { color: "#9aa8bf", fontSize: 12, fontWeight: "600", flex: 1 }, optionTextActive: { color: "#f4f3f9" }, chipWrap: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, chip: { borderWidth: 1, borderColor: "#283449", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 }, chipActive: { backgroundColor: "#21183c", borderColor: "#9b73dc" }, chipText: { color: "#71809b", fontSize: 12, fontWeight: "700" }, chipTextActive: { color: "#d4bfff" }, tip: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#101621", borderRadius: 10, padding: 13, marginTop: 24 }, tipText: { color: "#9aa8bf", fontSize: 11, flex: 1, lineHeight: 16 }, promptBox: { backgroundColor: "#0d121c", borderWidth: 1, borderColor: "#283449", borderRadius: 12, padding: 16, marginTop: 26 }, promptLabel: { color: "#b58cff", fontSize: 9, letterSpacing: 1.4, fontWeight: "800", marginBottom: 9 }, promptText: { color: "#9aa8bf", fontSize: 11, lineHeight: 17 }, footer: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 35 }, secondaryButton: { borderWidth: 1, borderColor: "#283449", borderRadius: 9, paddingHorizontal: 18, paddingVertical: 12 }, secondaryText: { color: "#9aa8bf", fontWeight: "700", fontSize: 12 }, disabled: { opacity: 0.35 }, primaryButton: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#b58cff", borderRadius: 9, paddingHorizontal: 17, paddingVertical: 12 }, primaryText: { color: "#0b0f19", fontWeight: "800", fontSize: 12 }, preview: { flex: 1, padding: 28, gap: 16, backgroundColor: "#0c1119" }, previewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, previewEyebrow: { color: "#53617a", fontSize: 10, letterSpacing: 1.5, fontWeight: "800" }, previewBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#11221c", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }, badgeText: { color: "#76e3b5", fontSize: 9, fontWeight: "800", letterSpacing: 1 }, profileCard: { backgroundColor: "#101621", borderWidth: 1, borderColor: "#283449", borderRadius: 16, padding: 20, alignItems: "center" }, avatarFrame: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: "#9b73dc", padding: 3, position: "relative" }, avatar: { width: "100%", height: "100%", borderRadius: 42 }, avatarGlow: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "#76e3b5", right: 4, bottom: 8, borderWidth: 2, borderColor: "#101621" }, profileName: { color: "#f4f3f9", fontSize: 20, fontWeight: "800", marginTop: 12 }, profileMeta: { color: "#71809b", fontSize: 11, marginTop: 4 }, tagRow: { flexDirection: "row", gap: 6, marginTop: 14 }, profileTag: { backgroundColor: "#21183c", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 }, profileTagText: { color: "#c5a9f4", fontSize: 9, fontWeight: "700" }, profileLine: { height: 1, backgroundColor: "#283449", alignSelf: "stretch", marginVertical: 18 }, profileSection: { color: "#53617a", fontSize: 9, letterSpacing: 1.2, fontWeight: "800", alignSelf: "stretch", marginBottom: 11 }, dnaRow: { flexDirection: "row", alignItems: "center", width: "100%", gap: 10, marginTop: 8 }, dnaLabel: { width: 48, color: "#71809b", fontSize: 10 }, dnaTrack: { flex: 1, height: 5, backgroundColor: "#202c40", borderRadius: 5 }, dnaFill: { height: 5, borderRadius: 5, backgroundColor: "#b58cff" }, chatCard: { backgroundColor: "#101621", borderWidth: 1, borderColor: "#283449", borderRadius: 16, padding: 16, flex: 1, minHeight: 260 }, chatHeader: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#202c40", paddingBottom: 12 }, smallAvatar: { width: 30, height: 30, borderRadius: 15, overflow: "hidden", marginRight: 9 }, smallAvatarImage: { width: "100%", height: "100%" }, chatName: { color: "#f4f3f9", fontSize: 12, fontWeight: "800" }, chatStatus: { color: "#76e3b5", fontSize: 9, marginTop: 2 }, chatMore: { marginLeft: "auto" }, messages: { flex: 1, paddingVertical: 12 }, bubble: { backgroundColor: "#1a2332", borderRadius: 12, borderTopLeftRadius: 3, padding: 11, marginBottom: 9, alignSelf: "flex-start", maxWidth: "88%" }, bubbleText: { color: "#c5cede", fontSize: 11, lineHeight: 16 }, userBubble: { backgroundColor: "#382862", borderRadius: 12, borderTopRightRadius: 3, padding: 11, marginBottom: 9, alignSelf: "flex-end", maxWidth: "88%" }, userBubbleText: { color: "#efe8ff", fontSize: 11, lineHeight: 16 }, composer: { flexDirection: "row", alignItems: "center", backgroundColor: "#0d121c", borderWidth: 1, borderColor: "#283449", borderRadius: 11, paddingLeft: 12, paddingRight: 5 }, composerInput: { flex: 1, color: "#f4f3f9", fontSize: 11, paddingVertical: 10 }, sendButton: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#b58cff", alignItems: "center", justifyContent: "center" }
});

export { systemPromptExample };
const systemPromptExample = "Structured prompt generated from the wizard selections.";

export function buildCompanionSystemPrompt(input: { name: string; relationship: string; traits: string[]; style: string; hair: string; eyes: string; outfit: string; language: string; tone: string }) {
  return `Du bist ${input.name}, eine virtuelle Begleiterin. Beziehung: ${input.relationship}. Persönlichkeit: ${input.traits.join(", ")}. Stil: ${input.style}, ${input.hair} Haare, ${input.eyes} Augen, ${input.outfit}. Sprache: ${input.language}. Tonalität: ${input.tone}. Nutze *Sternchen* für Gestik und Aktionen, stelle Gegenfragen und bleibe warm, aufmerksam und konsistent.`;
}
