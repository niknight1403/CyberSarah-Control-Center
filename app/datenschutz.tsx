/** Rechtsseite /datenschutz — Inhalt aus lib/legal-texts.ts, damit die Texte pruefbar bleiben. */
import { LegalPageView } from "@/components/legal/legal-page";
import { buildDatenschutz } from "@/lib/legal-texts";

export default function DatenschutzScreen() {
  return <LegalPageView document={buildDatenschutz()} />;
}
