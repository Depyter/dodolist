import PocketBase from 'pocketbase';
import { BehaviorSubject, Observable, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

export const ConnectionStatus = {
  Connected: 'connected' as ConnectionStatus,
  Disconnected: 'disconnected' as ConnectionStatus,
  Error: 'error' as ConnectionStatus,
};

class PocketBaseRealtimeManager {
  private pb: PocketBase;
  private connectionStatusSubject: BehaviorSubject<ConnectionStatus>;
  public connectionStatus$: Observable<ConnectionStatus>;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private initialReconnectInterval = 1000;
  private isInitialized = false;
  private healthCheckIntervalId: any = null;
  private healthCheckIntervalMs = 30000; // 30 secs

  constructor(pb: PocketBase) {
    this.pb = pb;
    this.connectionStatusSubject = new BehaviorSubject<ConnectionStatus>(ConnectionStatus.Disconnected);
    this.connectionStatus$ = this.connectionStatusSubject.asObservable();
    
    // Don't setup listeners immediately - wait for initialization
    this.initializeConnection();
    this.startPeriodicHealthCheck();

    // Listen for browser online/offline events
    window.addEventListener('online', () => {
      this.logWithTimestamp('Browser online event detected, checking health...');
      this.forceConnectionCheck(); // Already present, triggers health check
    });
    window.addEventListener('offline', () => {
      this.logWithTimestamp('Browser offline event detected, marking as disconnected.');
      this.connectionStatusSubject.next(ConnectionStatus.Disconnected);
      // Trigger a health check to confirm status (optional, but ensures state is up to date)
      this.checkHealth().then(isHealthy => {
        if (!isHealthy) {
          this.logWithTimestamp('Confirmed: PocketBase is not reachable after offline event.');
        }
      });
    });
  }

  protected logWithTimestamp(message: string, ...args: any[]) {
    const now = new Date().toISOString();
    console.log(`[${now}] [PocketBaseRealtimeManager] ${message}`, ...args);
  }

  private async initializeConnection() {
    this.logWithTimestamp('Initializing connection...');
    
    // Check initial connection state
    const isHealthy = await this.checkHealth();
    if (isHealthy) {
      this.logWithTimestamp('Initial health check passed');
      this.connectionStatusSubject.next(ConnectionStatus.Connected);
    } else {
      this.logWithTimestamp('Initial health check failed');
      this.connectionStatusSubject.next(ConnectionStatus.Disconnected);
    }
    
    // Now setup the realtime listeners
    this.setupRealtimeListeners();
    this.isInitialized = true;
    
    this.logWithTimestamp(`Initialized with status: ${this.connectionStatusSubject.value}`);
  }

  private setupRealtimeListeners() {
    this.logWithTimestamp('Setting up realtime listeners...');
    this.logWithTimestamp('Realtime listeners setup complete');
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logWithTimestamp('Max reconnect attempts reached. Giving up.');
      this.connectionStatusSubject.next(ConnectionStatus.Error);
      return;
    }

    const delay = this.initialReconnectInterval * Math.pow(2, this.reconnectAttempts);
    this.logWithTimestamp(`Scheduling reconnect in ${delay / 1000}s (attempt ${this.reconnectAttempts + 1})`);
    
    timer(delay)
      .pipe(
        takeUntil(this.connectionStatus$.pipe(
          // Only cancel if we successfully reconnect
          takeUntil(timer(delay + 5000)) // Or timeout after delay + 5s
        ))
      )
      .subscribe(async () => {
        this.reconnectAttempts++;
        this.logWithTimestamp(`Executing reconnect attempt ${this.reconnectAttempts}`);
        
        // Force a health check to trigger connection
        const isHealthy = await this.checkHealth();
        if (isHealthy) {
          this.logWithTimestamp('Reconnect successful via health check');
          this.connectionStatusSubject.next(ConnectionStatus.Connected);
          this.reconnectAttempts = 0;
        } else {
          this.logWithTimestamp('Reconnect failed, will retry');
          this.scheduleReconnect();
        }
      });
  }

  private startPeriodicHealthCheck() {
    if (this.healthCheckIntervalId) return;
    this.healthCheckIntervalId = setInterval(async () => {
      if (this.connectionStatusSubject.value !== ConnectionStatus.Connected) {
        this.logWithTimestamp('Periodic health check triggered...');
        const isHealthy = await this.checkHealth();
        if (isHealthy) {
          this.logWithTimestamp('Periodic health check: reconnected!');
          this.connectionStatusSubject.next(ConnectionStatus.Connected);
          this.reconnectAttempts = 0;
        }
      }
    }, this.healthCheckIntervalMs);
  }

  private stopPeriodicHealthCheck() {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
  }

  public async checkHealth(): Promise<boolean> {
    try {
      this.logWithTimestamp('Performing health check...');
      await this.pb.health.check();
      this.logWithTimestamp('Health check successful');
      return true;
    } catch (error) {
      this.logWithTimestamp('Health check failed:', error);
      return false;
    }
  }

  // Add method to manually trigger connection check
  public async forceConnectionCheck(): Promise<void> {
    this.logWithTimestamp('Manual connection check requested');
    const isHealthy = await this.checkHealth();
    const newStatus = isHealthy ? ConnectionStatus.Connected : ConnectionStatus.Disconnected;
    
    if (this.connectionStatusSubject.value !== newStatus) {
      this.logWithTimestamp(`Status changed from ${this.connectionStatusSubject.value} to ${newStatus}`);
      this.connectionStatusSubject.next(newStatus);
    }
  }

  // Add method to get current status synchronously
  public getCurrentStatus(): ConnectionStatus {
    return this.connectionStatusSubject.value;
  }

  public async subscribe(collectionName: string, callback: (e: any) => void, recordId?: string) {
    try {
      await this.pb.collection(collectionName).subscribe(recordId || '*', callback);
      this.logWithTimestamp(`Subscribed to ${collectionName}${recordId ? `:${recordId}` : ''}`);
    } catch (error) {
      this.logWithTimestamp(`Failed to subscribe to ${collectionName}:`, error);
      throw error;
    }
  }

  public async unsubscribe(collectionName: string, recordId?: string) {
    try {
      if (recordId) {
        await this.pb.collection(collectionName).unsubscribe(recordId);
      } else {
        await this.pb.collection(collectionName).unsubscribe();
      }
      this.logWithTimestamp(`Unsubscribed from ${collectionName}${recordId ? `:${recordId}` : ''}`);
    } catch (error) {
      this.logWithTimestamp(`Failed to unsubscribe from ${collectionName}:`, error);
      throw error;
    }
  }

  // Cleanup method
  public destroy() {
    this.logWithTimestamp('Destroying manager...');
    // Unsubscribe from all realtime events
    this.pb.realtime.unsubscribe();
    this.connectionStatusSubject.complete();
    this.stopPeriodicHealthCheck();
  }
}

export default PocketBaseRealtimeManager;