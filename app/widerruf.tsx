/** Rechtsseite /widerruf — Inhalt aus lib/legal-texts.ts, damit die Texte pruefbar bleiben. */
import { LegalPageView } from "@/components/legal/legal-page";
import { buildWiderruf } from "@/lib/legal-texts";

export default function WiderrufScreen() {
  return <LegalPageView document={buildWiderruf()} />;
}
