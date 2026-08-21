import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type StudioFile = {
  id: string;
  name: string;
  path: string;
  language: "tsx" | "ts" | "css" | "json";
  content: string;
  changed?: boolean;
};

export type StudioMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  kind?: "status" | "proposal";
};

export type ConsoleEvent = {
  id: string;
  level: "info" | "success" | "warning";
  label: string;
  detail: string;
};

const initialFiles: StudioFile[] = [
  {
    id: "home-screen",
    name: "index.tsx",
    path: "app/(tabs)/index.tsx",
    language: "tsx",
    content: `export default function HomeScreen() {
  return (
    <WorkspaceDashboard
      title="Project workspace"
      status="Ready"
    />
  );
}`,
  },
  {
    id: "workspace-client",
    name: "workspace-client.ts",
    path: "lib/workspace-client.ts",
    language: "ts",
    content: `export const workspaceClient = {
  async getStatus() {
    return { state: "offline" };
  },
};`,
  },
  {
    id: "theme",
    name: "theme.config.js",
    path: "theme.config.js",
    language: "json",
    content: `module.exports = {
  accent: "#52D8FF",
  panel: "#121823",
};`,
  },
];

const initialMessages: StudioMessage[] = [
  {
    id: "agent-welcome",
    role: "agent",
    kind: "status",
    content:
      "Der Agent ist bereit. Verbinde einen Workspace-Service in den Einstellungen, damit Vorschläge gegen dein echtes Repository geprüft und angewendet werden können.",
  },
];

const initialEvents: ConsoleEvent[] = [
  {
    id: "workspace-ready",
    level: "success",
    label: "Arbeitsbereich bereit",
    detail: "Lokaler Entwurfszustand geladen",
  },
  {
    id: "service-waiting",
    level: "warning",
    label: "Remote-Service ausstehend",
    detail: "Vorschau und Git-Operationen benötigen eine Workspace-URL",
  },
];

type WorkspaceContextValue = {
  files: StudioFile[];
  selectedFileId: string;
  selectedFile: StudioFile;
  messages: StudioMessage[];
  events: ConsoleEvent[];
  branch: string;
  changedFileCount: number;
  lastRefreshLabel: string;
  selectFile: (id: string) => void;
  updateFile: (id: string, content: string) => void;
  saveDraft: () => void;
  askAgent: (prompt: string) => void;
  refreshPreview: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [files, setFiles] = useState(initialFiles);
  const [selectedFileId, setSelectedFileId] = useState(initialFiles[0].id);
  const [messages, setMessages] = useState(initialMessages);
  const [events, setEvents] = useState(initialEvents);
  const [lastRefreshLabel, setLastRefreshLabel] = useState("Noch nicht aktualisiert");

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) ?? files[0],
    [files, selectedFileId],
  );

  const changedFileCount = useMemo(
    () => files.filter((file) => file.changed).length,
    [files],
  );

  const selectFile = useCallback((id: string) => setSelectedFileId(id), []);

  const updateFile = useCallback((id: string, content: string) => {
    setFiles((currentFiles) =>
      currentFiles.map((file) => (file.id === id ? { ...file, content, changed: true } : file)),
    );
  }, []);

  const saveDraft = useCallback(() => {
    if (!selectedFile.changed) return;

    setEvents((currentEvents) => [
      {
        id: `draft-${Date.now()}`,
        level: "info",
        label: "Entwurf gespeichert",
        detail: `${selectedFile.path} wartet auf Remote-Synchronisierung`,
      },
      ...currentEvents,
    ]);
  }, [selectedFile.changed, selectedFile.path]);

  const askAgent = useCallback((prompt: string) => {
    const requestId = `user-${Date.now()}`;
    const responseId = `agent-${Date.now()}`;
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: requestId, role: "user", content: prompt },
      {
        id: responseId,
        role: "agent",
        kind: "proposal",
        content:
          "Auftrag als Entwurf aufgenommen. Nach dem Verbinden deines Workspace-Service analysiert der Agent die Projektstruktur, erstellt einen Patch und zeigt ihn vor der Übernahme zur Prüfung an.",
      },
    ]);
  }, []);

  const refreshPreview = useCallback(() => {
    setLastRefreshLabel("Verbindung geprüft");
    setEvents((currentEvents) => [
      {
        id: `preview-${Date.now()}`,
        level: "info",
        label: "Vorschau aktualisiert",
        detail: "Kein Remote-Preview-Endpunkt konfiguriert",
      },
      ...currentEvents,
    ]);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      files,
      selectedFileId,
      selectedFile,
      messages,
      events,
      branch: "main",
      changedFileCount,
      lastRefreshLabel,
      selectFile,
      updateFile,
      saveDraft,
      askAgent,
      refreshPreview,
    }),
    [
      askAgent,
      changedFileCount,
      events,
      files,
      lastRefreshLabel,
      messages,
      refreshPreview,
      saveDraft,
      selectFile,
      selectedFile,
      selectedFileId,
      updateFile,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
