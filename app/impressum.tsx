/** Rechtsseite /impressum — Inhalt aus lib/legal-texts.ts, damit die Texte pruefbar bleiben. */
import { LegalPageView } from "@/components/legal/legal-page";
import { buildImpressum } from "@/lib/legal-texts";

export default function ImpressumScreen() {
  return <LegalPageView document={buildImpressum()} />;
}
