/**
 * Secrets-Panel (Sprint 167) — Verwaltung des verschluesselten Vault.
 *
 * Wird im Superagenten-Chat (Modul "VAULT") und im Repo-Chat (Tab
 * "Secrets") eingesetzt. Der Vault speichert API-Keys/Tokens JE NUTZER
 * AES-256-GCM-verschluesselt serverseitig; erkannte Keys in Chat-Nachrichten
 * werden AUTONOM gespeichert und der Klartext aus dem Verlauf maskiert.
 *
 * Das Panel zeigt NUR Metadaten + maskierte Vorschau (nie Klartext),
 * ermoeglicht Anlegen/Aktualisieren und Loeschen einzelner Eintraege.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";
import { trpc } from "@/lib/trpc";

const KIND_LABELS: Record<string, string> = {
  openai: "OpenAI",
  groq: "Groq",
  anthropic: "Anthropic",
  google: "Google",
  github: "GitHub",
  openrouter: "OpenRouter",
  slack: "Slack",
  aws: "AWS",
  bearer: "Bearer",
  hex_token: "Hex-Token",
  custom: "Eigenes",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return "";
  }
}

export function SecretsPanel() {

  const listQuery = trpc.secrets.list.useQuery(undefined, { retry: false });
  const upsertMutation = trpc.secrets.upsert.useMutation();
  const deleteMutation = trpc.secrets.delete.useMutation();

  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = () => {
    void listQuery.refetch();
    setValue("");
    setNote("");
  };

  const saveSecret = () => {
    const trimmedName = name.trim().toUpperCase();
    if (trimmedName.length < 3) {
      setStatus("Name: 3-40 Zeichen, nur A-Z/0-9/_ (z. B. GROQ_API_KEY).");
      return;
    }
    if (value.trim().length < 8) {
      setStatus("Wert zu kurz (min. 8 Zeichen).");
      return;
    }
    upsertMutation.mutate(
      { name: trimmedName, value: value.trim(), note: note.trim() || undefined },
      {
        onSuccess: (entry) => {
          setName("");
          setStatus(`'${entry.name}' verschlüsselt gespeichert — nur maskiert sichtbar.`);
          refresh();
        },
        onError: (error) => setStatus(error.message ?? "Speichern fehlgeschlagen."),
      },
    );
  };

  const removeSecret = (secretName: string) => {
    Alert.alert("Secret löschen?", `'${secretName}' wird dauerhaft aus dem Vault entfernt.`, [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate(
            { name: secretName },
            {
              onSuccess: () => {
                setStatus(`'${secretName}' gelöscht.`);
                void listQuery.refetch();
              },
              onError: (error) => setStatus(error.message ?? "Löschen fehlgeschlagen."),
            },
          );
        },
      },
    ]);
  };

  const entries = listQuery.data ?? [];

  return (
    <View>
      <View style={styles.introCard}>
        <Ionicons name="lock-closed" size={16} color={glassPalette.cyan} />
        <Text style={styles.introText}>
          Verschlüsselter Vault (AES-256-GCM) — erkannte Keys im Chat werden automatisch
          gespeichert, der Klartext niemals im Verlauf abgelegt. Werte sind nur maskiert sichtbar.
        </Text>
      </View>

      {/* Neues Secret */}
      <View style={styles.addCard}>
        <Text style={styles.sectionLabel}>SECRET HINZUFÜGEN / AKTUALISIEREN</Text>
        <TextInput
          accessibilityLabel="Secret-Name"
          autoCapitalize="characters"
          placeholder="NAME (z. B. GROQ_API_KEY)"
          placeholderTextColor={glassSurface.textSecondary}
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Secret-Wert"
          placeholder="Wert (Key/Token) — verschlüsselt abgelegt"
          placeholderTextColor={glassSurface.textSecondary}
          value={value}
          onChangeText={setValue}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Notiz"
          placeholder="Optionale Notiz (z. B. wofür der Key ist)"
          placeholderTextColor={glassSurface.textSecondary}
          value={note}
          onChangeText={setNote}
          style={styles.input}
        />
        <TouchableOpacity
          onPress={saveSecret}
          disabled={upsertMutation.isPending}
          style={[styles.saveButton, upsertMutation.isPending && styles.buttonDisabled]}
        >
          {upsertMutation.isPending ? (
            <ActivityIndicator size="small" color={glassDepth.void} />
          ) : (
            <Text style={styles.saveButtonText}>Verschlüsselt speichern</Text>
          )}
        </TouchableOpacity>
      </View>

      {status ? <Text style={styles.statusText}>{status}</Text> : null}

      {/* Liste */}
      <Text style={styles.sectionLabel}>
        VAULT · {entries.length} SECRET{entries.length === 1 ? "" : "S"}
      </Text>
      {listQuery.isLoading ? (
        <ActivityIndicator size="small" color={glassPalette.cyan} />
      ) : entries.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Noch keine Secrets. Im Chat erkannte Keys landen automatisch hier — oder oben manuell anlegen.
          </Text>
        </View>
      ) : (
        entries.map((entry) => (
          <View key={entry.name} style={styles.entryCard}>
            <View style={styles.entryRow}>
              <View style={styles.entryInfo}>
                <Text style={styles.entryName}>{entry.name}</Text>
                <Text style={styles.entryDetail}>
                  {KIND_LABELS[entry.kind] ?? entry.kind} · {entry.hint}
                  {entry.note ? ` · ${entry.note}` : ""} · {formatDate(entry.updatedAt)}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel={`Secret ${entry.name} löschen`}
                onPress={() => removeSecret(entry.name)}
                disabled={deleteMutation.isPending}
                style={styles.deleteButton}
              >
                <Ionicons name="trash-outline" size={16} color={glassPalette.red ?? glassPalette.red} />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    introCard: {
      flexDirection: "row",
      gap: 8,
      alignItems: "flex-start",
      padding: 12,
      borderRadius: 12,
      backgroundColor: `${glassPalette.cyan}14`,
      marginBottom: 12,
    },
    introText: { flex: 1, fontSize: 12, lineHeight: 17, color: glassSurface.textSecondary },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: glassSurface.textSecondary,
      marginBottom: 8,
      marginTop: 4,
    },
    addCard: {
      padding: 14,
      borderRadius: 14,
      backgroundColor: glassDepth.glass,
      marginBottom: 12,
      gap: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: glassSurface.border ?? glassSurface.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: glassSurface.textPrimary,
      backgroundColor: glassDepth.void,
    },
    saveButton: {
      backgroundColor: glassPalette.cyan,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: "center",
    },
    buttonDisabled: { opacity: 0.55 },
    saveButtonText: { color: glassDepth.void, fontWeight: "700", fontSize: 14 },
    statusText: { fontSize: 12, color: glassSurface.textSecondary, marginBottom: 10 },
    entryCard: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: glassDepth.glass,
      marginBottom: 8,
    },
    entryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    entryInfo: { flex: 1 },
    entryName: { color: glassSurface.textPrimary, fontWeight: "700", fontSize: 14 },
    entryDetail: { color: glassSurface.textSecondary, fontSize: 12, marginTop: 2 },
    deleteButton: { padding: 6 },
    emptyCard: { padding: 14, borderRadius: 12, backgroundColor: glassDepth.glass },
    emptyText: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 17 },
  });
}

const styles = createStyles();
