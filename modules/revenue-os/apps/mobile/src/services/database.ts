import Realm, { ObjectSchema, Configuration } from 'realm';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DB_VERSION_KEY = '@cybersarah/db_version';
const CURRENT_DB_VERSION = 1;

// ─── Realm-Schemata ────────────────────────────────────────────────

const AgentSchema: ObjectSchema = {
  name: 'Agent',
  primaryKey: 'id',
  properties: {
    id: 'string',
    name: 'string',
    type: 'string',
    status: { type: 'string', default: 'idle' },
    lastRun: { type: 'date', optional: true },
    lastError: { type: 'string', optional: true },
    config: { type: 'string', default: '{}' },
    createdAt: { type: 'date', default: () => new Date() },
    updatedAt: { type: 'date', default: () => new Date() },
  },
};

const RevenueOpportunitySchema: ObjectSchema = {
  name: 'RevenueOpportunity',
  primaryKey: 'id',
  properties: {
    id: 'int',
    titel: 'string',
    beschreibung: { type: 'string', optional: true },
    kanal: 'string',
    marke: 'string',
    status: { type: 'string', default: 'entdeckt' },
    geschaetzterMonatsumsatz: { type: 'string', default: '0' },
    stripePaymentLink: { type: 'string', optional: true },
    prioritaet: { type: 'int', default: 3 },
    gefundenVon: { type: 'string', default: 'system' },
    createdAt: { type: 'date', default: () => new Date() },
    updatedAt: { type: 'date', default: () => new Date() },
  },
};

const TransactionSchema: ObjectSchema = {
  name: 'Transaction',
  primaryKey: 'id',
  properties: {
    id: 'string',
    betrag: 'double',
    waehrung: { type: 'string', default: 'EUR' },
    status: 'string',
    typ: 'string',
    beschreibung: { type: 'string', optional: true },
    kundeEmail: { type: 'string', optional: true },
    kundeName: { type: 'string', optional: true },
    produktName: { type: 'string', optional: true },
    zahlungsMethode: { type: 'string', optional: true },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'date', default: () => new Date() },
    syncedAt: { type: 'date', optional: true },
  },
};

const ContentSchema: ObjectSchema = {
  name: 'Content',
  primaryKey: 'id',
  properties: {
    id: 'int',
    titel: 'string',
    inhalt: { type: 'string', optional: true },
    typ: 'string',
    status: 'string',
    marke: { type: 'string', optional: true },
    plattform: { type: 'string', optional: true },
    aufrufe: { type: 'int', default: 0 },
    interaktionen: { type: 'int', default: 0 },
    erstelltAm: { type: 'date', default: () => new Date() },
    veroeffentlichtAm: { type: 'date', optional: true },
    metadata: { type: 'string', default: '{}' },
  },
};

const SCHEMAS = [AgentSchema, RevenueOpportunitySchema, TransactionSchema, ContentSchema];

// ─── Realm-Instanz (Singleton) ──────────────────────────────────────
let realmInstance: Realm | null = null;

export async function initializeDatabase(): Promise<Realm> {
  if (realmInstance) {
    return realmInstance;
  }

  // Prüfe DB-Version für Migrationen
  const storedVersion = await AsyncStorage.getItem(DB_VERSION_KEY);
  const schemaVersion = storedVersion ? parseInt(storedVersion, 10) : 0;

  const config: Configuration = {
    schema: SCHEMAS,
    schemaVersion: CURRENT_DB_VERSION,
    deleteRealmIfMigrationNeeded: __DEV__,
    onMigration: (oldRealm: Realm, newRealm: Realm) => {
      if (oldRealm.schemaVersion < 1) {
        // Migration von v0 auf v1
        const oldAgents = oldRealm.objects('Agent');
        const newAgents = newRealm.objects('Agent');
        for (let i = 0; i < oldAgents.length; i++) {
          newAgents[i].config = oldAgents[i].config ?? '{}';
          newAgents[i].updatedAt = new Date();
        }
      }
    },
  };

  try {
    realmInstance = await Realm.open(config);
    await AsyncStorage.setItem(DB_VERSION_KEY, String(CURRENT_DB_VERSION));
    return realmInstance;
  } catch (error) {
    console.error('[DB] Realm-Öffnen fehlgeschlagen:', error);
    // Fallback: neue DB ohne Migration
    const fallbackConfig: Configuration = {
      schema: SCHEMAS,
      schemaVersion: CURRENT_DB_VERSION,
      deleteRealmIfMigrationNeeded: true,
    };
    realmInstance = await Realm.open(fallbackConfig);
    return realmInstance;
  }
}

export function getDatabase(): Realm {
  if (!realmInstance) {
    throw new Error('Datenbank nicht initialisiert. Rufe initializeDatabase() auf.');
  }
  return realmInstance;
}

export function closeDatabase(): void {
  if (realmInstance) {
    realmInstance.close();
    realmInstance = null;
  }
}

// ─── Hilfsfunktionen für CRUD ──────────────────────────────────────
export function writeTransaction<T>(callback: () => T): T {
  const db = getDatabase();
  let result: T;
  db.write(() => {
    result = callback();
  });
  return result!;
}

export default {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  writeTransaction,
};
