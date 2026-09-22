import NetInfo from '@react-native-community/netinfo';
import { apiClient } from './api';

// ─── Sync-Status ────────────────────────────────────────────────────
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';
export type SyncListener = (status: SyncStatus, message?: string) => void;

// ─── Sync-Service ───────────────────────────────────────────────────
class SyncServiceClass {
  private isSyncing = false;
  private lastSyncAt: Date | null = null;
  private listeners: Set<SyncListener> = new Set();

  onStatusChange(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(status: SyncStatus, message?: string): void {
    this.listeners.forEach((listener) => listener(status, message));
  }

  async syncAll(): Promise<{ success: boolean; syncedAt: Date }> {
    if (this.isSyncing) {
      return { success: false, syncedAt: this.lastSyncAt ?? new Date() };
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      this.notify('error', 'Keine Internetverbindung');
      throw new Error('Keine Internetverbindung');
    }

    this.isSyncing = true;
    this.notify('syncing', 'Synchronisiere...');

    try {
      const results = await Promise.allSettled([
        this.syncAgents(),
        this.syncRevenue(),
        this.syncContent(),
        this.syncTransactions(),
      ]);

      const failed = results.filter((r) => r.status === 'rejected').length;
      this.lastSyncAt = new Date();

      if (failed === 0) {
        this.notify('success', 'Alle Daten synchronisiert');
      } else {
        this.notify('success', `${results.length - failed}/${results.length} synchronisiert`);
      }

      return { success: true, syncedAt: this.lastSyncAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync fehlgeschlagen';
      this.notify('error', message);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncAgents(): Promise<void> {
    await apiClient.get('/agents/status');
  }

  private async syncRevenue(): Promise<void> {
    await apiClient.get('/revenue/status');
  }

  private async syncContent(): Promise<void> {
    await apiClient.get('/content/uebersicht');
  }

  private async syncTransactions(): Promise<void> {
    await apiClient.get('/finance/transactions');
  }

  getLastSync(): Date | null {
    return this.lastSyncAt;
  }

  isCurrentlySyncing(): boolean {
    return this.isSyncing;
  }
}

export const SyncService = new SyncServiceClass();
export default SyncService;
