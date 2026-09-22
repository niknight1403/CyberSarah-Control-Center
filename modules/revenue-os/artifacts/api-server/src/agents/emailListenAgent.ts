import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { db } from "@workspace/db";
import { emailSequenzenTable, leadsTable, produkteTable, agentLogsTable, agentsTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

async function holeAgentId(): Promise<number | null> {
  if (!db) return null;
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.typ, "email_listen_monetarisierung"))
    .limit(1);
  return agent?.id ?? null;
}

// ─── Konfiguration ──────────────────────────────────────────────────────────

const DEFAULT_SEQUENZEN: Array<{
  marke: string;
  leadMagnet: string;
  name: string;
  emails: Array<{ betreff: string; inhalt: string; tagNachAnmeldung: number }>;
}> = [
  {
    marke: "CyberSarah",
    leadMagnet: "KI-Automatisierungs-Guide",
    name: "CyberSarah Welcome Sequenz",
    emails: [
      { betreff: "Willkommen! Dein KI-Guide ist bereit 🚀", inhalt: "", tagNachAnmeldung: 0 },
      { betreff: "So automatisierst du dein Business mit KI", inhalt: "", tagNachAnmeldung: 1 },
      { betreff: "Die 5 besten KI-Tools für 2026", inhalt: "", tagNachAnmeldung: 3 },
      { betreff: "Case Study: Wie KI meinen Umsatz verdoppelte", inhalt: "", tagNachAnmeldung: 5 },
      { betreff: "🚀 Bereit für das nächste Level?", inhalt: "", tagNachAnmeldung: 7 },
    ],
  },
  {
    marke: "GeldPilot AI",
    leadMagnet: "Online-Geldverdienen Starterkit",
    name: "GeldPilot Einstieg Sequenz",
    emails: [
      { betreff: "Dein Starterkit ist da! 💰", inhalt: "", tagNachAnmeldung: 0 },
      { betreff: "Die 3 schnellsten Wege online Geld zu verdienen", inhalt: "", tagNachAnmeldung: 1 },
      { betreff: "Fehler die 90% der Anfänger machen", inhalt: "", tagNachAnmeldung: 3 },
      { betreff: "Vom Nebenjob zum Vollzeit-Online-Business", inhalt: "", tagNachAnmeldung: 5 },
      { betreff: "⏰ Letzte Chance: Dein Upgrade wartet", inhalt: "", tagNachAnmeldung: 7 },
    ],
  },
  {
    marke: "UnternehmerGPT",
    leadMagnet: "KMUs KI-Business-Bundle",
    name: "UnternehmerGPT Nurture",
    emails: [
      { betreff: "Willkommen, Herr Unternehmer! 🏢", inhalt: "", tagNachAnmeldung: 0 },
      { betreff: "So sparen KMUs 40% Kosten mit KI", inhalt: "", tagNachAnmeldung: 1 },
      { betreff: "5 Geschäftsprozesse die KI übernehmen kann", inhalt: "", tagNachAnmeldung: 3 },
      { betreff: "ROI-Rechner: Was bringt KI Ihrem Unternehmen?", inhalt: "", tagNachAnmeldung: 5 },
      { betreff: "📞 Kostenloses Strategiegespräch vereinbaren", inhalt: "", tagNachAnmeldung: 7 },
    ],
  },
];

// ─── Sequenzen erstellen (fehlende Marken/Daten ergänzen) ────────────────────

export async function erstelleFehlendeSequenzen(): Promise<{ erstellt: number }> {
  logger.info("📧 EmailListenAgent: Sequenzen-Check gestartet");
  if (!db) return { erstellt: 0 };

  const agentId = await holeAgentId();
  let erstellt = 0;

  for (const seq of DEFAULT_SEQUENZEN) {
    const vorhanden = await db
      .select()
      .from(emailSequenzenTable)
      .where(
        and(
          eq(emailSequenzenTable.marke, seq.marke),
          eq(emailSequenzenTable.name, seq.name)
        )
      )
      .limit(1);

    if (vorhanden.length > 0) continue;

    const produkt = await db
      .select()
      .from(produkteTable)
      .where(eq(produkteTable.kategorie, "kurs"))
      .limit(1);

    let emailsMitInhalt = seq.emails;
    if (openaiVerfuegbar) {
      try {
        emailsMitInhalt = await generiereEmailInhalte(seq);
      } catch (err) {
        const { nachricht } = handleOpenAIFehler(err, "Email Listen Agent");
        logger.warn({ marke: seq.marke, fehler: nachricht }, "KI-Generierung fehlgeschlagen — nutze Platzhalter");
      }
    }

    await db.insert(emailSequenzenTable).values({
      marke: seq.marke,
      leadMagnet: seq.leadMagnet,
      name: seq.name,
      emails: emailsMitInhalt,
      produktId: produkt?.[0]?.id ?? null,
      aktiv: true,
    });

    erstellt++;
    logger.info({ marke: seq.marke, name: seq.name }, "📧 E-Mail-Sequenz erstellt");
  }

  // Leads ohne Sequenz zuweisen
  const freieLeads = await db
    .select()
    .from(leadsTable)
    .where(and(isNull(leadsTable.sequenzId), eq(leadsTable.status, "aktiv")))
    .limit(50);

  for (const lead of freieLeads) {
    const passendeSeq = await db
      .select()
      .from(emailSequenzenTable)
      .where(
        and(
          eq(emailSequenzenTable.marke, lead.marke),
          eq(emailSequenzenTable.aktiv, true)
        )
      )
      .limit(1);

    if (passendeSeq[0]) {
      await db
        .update(leadsTable)
        .set({ sequenzId: passendeSeq[0].id, updatedAt: new Date() })
        .where(eq(leadsTable.id, lead.id));
    }
  }

  if (erstellt > 0 && agentId) {
    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "E-Mail-Listen-Monetarisierungs-Agent",
      aktion: "Sequenzen erstellt",
      status: "erfolgreich",
      nachricht: `${erstellt} neue E-Mail-Sequenzen erstellt`,
      metadaten: JSON.stringify({ erstellt }),
      dauer: 0,
    });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
  }

  return { erstellt };
}

// ─── KI-generierte E-Mail-Inhalte ───────────────────────────────────────────

async function generiereEmailInhalte(
  seq: (typeof DEFAULT_SEQUENZEN)[number]
): Promise<Array<{ betreff: string; inhalt: string; tagNachAnmeldung: number }>> {
  const result: Array<{ betreff: string; inhalt: string; tagNachAnmeldung: number }> = [];

  for (const email of seq.emails) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Du bist ein professioneller E-Mail-Marketing-Experte für die Marke "${seq.marke}". Schreibe überzeugende, personalisierte E-Mails auf Deutsch. Keine Platzhalter, echter produktionsreifer Content.`,
          },
          {
            role: "user",
            content: `Erstelle eine E-Mail für "${seq.name}" (Tag ${email.tagNachAnmeldung} nach Anmeldung).
Betreff: ${email.betreff}
Lead-Magnet: ${seq.leadMagnet}
Ziel: Nutzer zum Upgrade auf unser Premium-Produkt bewegen.
Schreibe die E-Mail komplett aus (150-250 Wörter). Struktur: Personalisierter Anreiß, Hauptteil mit Mehrwert, CTA zum Produkt.`,
          },
        ],
        max_tokens: 800,
        temperature: 0.7,
      });

      result.push({
        betreff: email.betreff,
        inhalt: completion.choices[0]?.message?.content ?? `[KI-Platzhalter für: ${email.betreff}]`,
        tagNachAnmeldung: email.tagNachAnmeldung,
      });
    } catch {
      result.push(email);
    }
  }

  return result;
}

// ─── Fällige E-Mails versenden ──────────────────────────────────────────────

export async function versendeFaelligeEmails(): Promise<{ versendet: number; fehler: number }> {
  logger.info("📧 EmailListenAgent: Fällige Emails Check gestartet");
  if (!db) return { versendet: 0, fehler: 0 };

  const agentId = await holeAgentId();
  let versendet = 0;
  let fehler = 0;

  const faelligeLeads = await db
    .select({
      leadId: leadsTable.id,
      email: leadsTable.email,
      marke: leadsTable.marke,
      sequenzId: leadsTable.sequenzId,
      aktuellerSchritt: leadsTable.aktuellerSchritt,
      letzteEmailAm: leadsTable.letzteEmailAm,
    })
    .from(leadsTable)
    .where(eq(leadsTable.status, "aktiv"))
    .limit(20);

  for (const lead of faelligeLeads) {
    if (!lead.sequenzId) continue;

    const [sequenz] = await db
      .select()
      .from(emailSequenzenTable)
      .where(eq(emailSequenzenTable.id, lead.sequenzId))
      .limit(1);

    if (!sequenz || !sequenz.emails) continue;

    const emails = sequenz.emails as Array<{
      betreff: string;
      inhalt: string;
      tagNachAnmeldung: number;
    }>;

    const naechsterSchritt = lead.aktuellerSchritt + 1;
    if (naechsterSchritt >= emails.length) {
      await db
        .update(leadsTable)
        .set({ status: "abgeschlossen", updatedAt: new Date() })
        .where(eq(leadsTable.id, lead.leadId));
      continue;
    }

    const naechsteEmail = emails[naechsterSchritt];
    if (!naechsteEmail) continue;

    // Min. 1 Tag seit letzter E-Mail
    if (lead.letzteEmailAm) {
      const tageSeitLetzter = Math.floor(
        (Date.now() - new Date(lead.letzteEmailAm).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (tageSeitLetzter < 1) continue;
    }

    try {
      const metadaten = JSON.stringify({
        emailId: `${lead.sequenzId}-${naechsterSchritt}`,
        betreff: naechsteEmail.betreff,
        leadEmail: lead.email,
        marke: lead.marke,
        schritt: naechsterSchritt,
        gesamt: emails.length,
      });

      if (agentId) {
        await db.insert(agentLogsTable).values({
          agentId,
          agentName: "E-Mail-Listen-Monetarisierungs-Agent",
          aktion: `E-Mail versendet: "${naechsteEmail.betreff}"`,
          status: "erfolgreich",
          nachricht: `E-Mail ${naechsterSchritt + 1}/${emails.length} an ${lead.email} (${lead.marke})`,
          metadaten,
          dauer: 0,
        });
      }

      await db
        .update(leadsTable)
        .set({
          aktuellerSchritt: naechsterSchritt,
          letzteEmailAm: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(leadsTable.id, lead.leadId));

      await db
        .update(emailSequenzenTable)
        .set({ klicks: sql`${emailSequenzenTable.klicks} + 1` })
        .where(eq(emailSequenzenTable.id, lead.sequenzId));

      versendet++;
      logger.info(
        { email: lead.email, marke: lead.marke, schritt: naechsterSchritt },
        "📧 E-Mail versendet"
      );
    } catch (err) {
      fehler++;
      logger.error({ email: lead.email, fehler: err }, "📧 E-Mail-Versand fehlgeschlagen");
    }
  }

  if ((versendet > 0 || fehler > 0) && agentId) {
    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "E-Mail-Listen-Monetarisierungs-Agent",
      aktion: "E-Mail-Versand-Zusammenfassung",
      status: fehler > 0 && versendet === 0 ? "fehler" : "erfolgreich",
      nachricht: `${versendet} versendet, ${fehler} Fehler`,
      metadaten: JSON.stringify({ versendet, fehler }),
      dauer: 0,
    });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
  }

  return { versendet, fehler };
}
