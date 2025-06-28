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

  constructor(pb: PocketBase) {
    this.pb = pb;
    this.connectionStatusSubject = new BehaviorSubject<ConnectionStatus>(ConnectionStatus.Disconnected);
    this.connectionStatus$ = this.connectionStatusSubject.asObservable();
    
    // Don't setup listeners immediately - wait for initialization
    this.initializeConnection();
  }

  private async initializeConnection() {
    console.log('[PocketBaseRealtimeManager] Initializing connection...');
    
    // Check initial connection state
    const isHealthy = await this.checkHealth();
    if (isHealthy) {
      console.log('[PocketBaseRealtimeManager] Initial health check passed');
      this.connectionStatusSubject.next(ConnectionStatus.Connected);
    } else {
      console.log('[PocketBaseRealtimeManager] Initial health check failed');
      this.connectionStatusSubject.next(ConnectionStatus.Disconnected);
    }
    
    // Now setup the realtime listeners
    this.setupRealtimeListeners();
    this.isInitialized = true;
    
    console.log(`[PocketBaseRealtimeManager] Initialized with status: ${this.connectionStatusSubject.value}`);
  }

  private setupRealtimeListeners() {
    console.log('[PocketBaseRealtimeManager] Setting up realtime listeners...');
    
    // IMPORTANT: PocketBase uses different event names than you might expect
    // Let's try multiple possible event names and see which ones fire
    
    // Standard PocketBase events
    this.pb.realtime.subscribe('PB_CONNECT', (e) => {
      console.log('[PocketBaseRealtimeManager] PB_CONNECT event received:', e);
      this.connectionStatusSubject.next(ConnectionStatus.Connected);
      this.reconnectAttempts = 0;
    });

    this.pb.realtime.subscribe('PB_DISCONNECT', (e) => {
      console.log('[PocketBaseRealtimeManager] PB_DISCONNECT event received:', e);
      this.connectionStatusSubject.next(ConnectionStatus.Disconnected);
      if (navigator.onLine) {
        this.scheduleReconnect();
      }
    });

    // Alternative event names to try (PocketBase versions may vary)
    this.pb.realtime.subscribe('connect', (e) => {
      console.log('[PocketBaseRealtimeManager] connect event received:', e);
      this.connectionStatusSubject.next(ConnectionStatus.Connected);
      this.reconnectAttempts = 0;
    });

    this.pb.realtime.subscribe('disconnect', (e) => {
      console.log('[PocketBaseRealtimeManager] disconnect event received:', e);
      this.connectionStatusSubject.next(ConnectionStatus.Disconnected);
      if (navigator.onLine) {
        this.scheduleReconnect();
      }
    });

    // Error handling
    this.pb.realtime.subscribe('error', (e) => {
      console.error('[PocketBaseRealtimeManager] Error event received:', e);
      this.connectionStatusSubject.next(ConnectionStatus.Error);
    });

    console.log('[PocketBaseRealtimeManager] Realtime listeners setup complete');
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[PocketBaseRealtimeManager] Max reconnect attempts reached. Giving up.');
      this.connectionStatusSubject.next(ConnectionStatus.Error);
      return;
    }

    const delay = this.initialReconnectInterval * Math.pow(2, this.reconnectAttempts);
    console.log(`[PocketBaseRealtimeManager] Scheduling reconnect in ${delay / 1000}s (attempt ${this.reconnectAttempts + 1})`);
    
    timer(delay)
      .pipe(
        takeUntil(this.connectionStatus$.pipe(
          // Only cancel if we successfully reconnect
          takeUntil(timer(delay + 5000)) // Or timeout after delay + 5s
        ))
      )
      .subscribe(async () => {
        this.reconnectAttempts++;
        console.log(`[PocketBaseRealtimeManager] Executing reconnect attempt ${this.reconnectAttempts}`);
        
        // Force a health check to trigger connection
        const isHealthy = await this.checkHealth();
        if (isHealthy) {
          console.log('[PocketBaseRealtimeManager] Reconnect successful via health check');
          this.connectionStatusSubject.next(ConnectionStatus.Connected);
          this.reconnectAttempts = 0;
        } else {
          console.log('[PocketBaseRealtimeManager] Reconnect failed, will retry');
          this.scheduleReconnect();
        }
      });
  }

  public async checkHealth(): Promise<boolean> {
    try {
      console.log('[PocketBaseRealtimeManager] Performing health check...');
      await this.pb.health.check();
      console.log('[PocketBaseRealtimeManager] Health check successful');
      return true;
    } catch (error) {
      console.error('[PocketBaseRealtimeManager] Health check failed:', error);
      return false;
    }
  }

  // Add method to manually trigger connection check
  public async forceConnectionCheck(): Promise<void> {
    console.log('[PocketBaseRealtimeManager] Manual connection check requested');
    const isHealthy = await this.checkHealth();
    const newStatus = isHealthy ? ConnectionStatus.Connected : ConnectionStatus.Disconnected;
    
    if (this.connectionStatusSubject.value !== newStatus) {
      console.log(`[PocketBaseRealtimeManager] Status changed from ${this.connectionStatusSubject.value} to ${newStatus}`);
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
      console.log(`[PocketBaseRealtimeManager] Subscribed to ${collectionName}${recordId ? `:${recordId}` : ''}`);
    } catch (error) {
      console.error(`[PocketBaseRealtimeManager] Failed to subscribe to ${collectionName}:`, error);
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
      console.log(`[PocketBaseRealtimeManager] Unsubscribed from ${collectionName}${recordId ? `:${recordId}` : ''}`);
    } catch (error) {
      console.error(`[PocketBaseRealtimeManager] Failed to unsubscribe from ${collectionName}:`, error);
      throw error;
    }
  }

  // Cleanup method
  public destroy() {
    console.log('[PocketBaseRealtimeManager] Destroying manager...');
    // Unsubscribe from all realtime events
    this.pb.realtime.unsubscribe();
    this.connectionStatusSubject.complete();
  }
}

export default PocketBaseRealtimeManager;

// DEBUGGING VERSION - Use this temporarily to see what events are actually firing
class DebugPocketBaseRealtimeManager extends PocketBaseRealtimeManager {
  constructor(pb: PocketBase) {
    super(pb);
    this.setupDebugListeners(pb);
  }

  private setupDebugListeners(pb: PocketBase) {
    console.log('[DEBUG] Setting up debug listeners for ALL possible events...');
    
    // Try to listen to any possible event names
    const possibleEvents = [
      'PB_CONNECT', 'PB_DISCONNECT', 'connect', 'disconnect', 
      'open', 'close', 'error', 'message', 'reconnect',
      'connection', 'disconnection', 'online', 'offline'
    ];
    
    possibleEvents.forEach(eventName => {
      try {
        pb.realtime.subscribe(eventName, (data) => {
          console.log(`[DEBUG] Event '${eventName}' fired with data:`, data);
        });
      } catch (error) {
      if (error instanceof Error) {
          console.log(`[DEBUG] Could not subscribe to event '${eventName}':`, error.message);
        } else {
          console.log(`[DEBUG] Could not subscribe to event '${eventName}':`, error);
        }
      }
    });

    // Also monitor the realtime object itself
    console.log('[DEBUG] PocketBase realtime object:', pb.realtime);
    console.log('[DEBUG] Available methods:', Object.getOwnPropertyNames(pb.realtime));
  }
}

// Export the debug version for testing
export { DebugPocketBaseRealtimeManager };