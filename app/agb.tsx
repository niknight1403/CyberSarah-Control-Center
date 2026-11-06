/** Rechtsseite /agb — Inhalt aus lib/legal-texts.ts, damit die Texte pruefbar bleiben. */
import { LegalPageView } from "@/components/legal/legal-page";
import { buildAgb } from "@/lib/legal-texts";

export default function AGBScreen() {
  return <LegalPageView document={buildAgb()} />;
}
