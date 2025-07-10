import { App } from '@capacitor/app';
import PocketBase from 'pocketbase';
import { BehaviorSubject, Observable } from 'rxjs';
import { networkStatusService } from './NetworkStatusService';

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
  
  constructor(pb: PocketBase) {
    this.pb = pb;
    this.connectionStatusSubject = new BehaviorSubject<ConnectionStatus>(
      this.pb.realtime.isConnected ? ConnectionStatus.Connected : ConnectionStatus.Disconnected
    );
    this.connectionStatus$ = this.connectionStatusSubject.asObservable();
    
    // Setup connection listeners using PocketBase native events
    this.setupRealtimeListeners();
    
    // Listen for network status changes
    networkStatusService.status$.subscribe(status => {
      if (status === 'online' && !this.pb.realtime.isConnected) {
        this.logWithTimestamp('Network online, reconnecting...');
        this.reconnectRealtime();
      }
    });

    // Listen for app state changes (background/foreground)
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && !this.pb.realtime.isConnected) {
        this.logWithTimestamp('App is active, reconnecting...');
        this.reconnectRealtime();
      }
    });
  }

  public reconnectRealtime(): void {
    this.logWithTimestamp('Reconnecting realtime...');
    // PocketBase handles reconnection internally, but we can force a disconnect/reconnect
    this.pb.realtime.unsubscribe();
    
    // PocketBase will auto-reconnect on the next subscription
    this.updateConnectionStatus();
  }

  protected logWithTimestamp(message: string, ...args: any[]) {
    const now = new Date().toISOString();
    console.log(`[${now}] [PocketBaseRealtimeManager] ${message}`, ...args);
  }

  private setupRealtimeListeners() {
    this.logWithTimestamp('Setting up realtime listeners...');
    
    // Listen for PocketBase realtime connection changes
    this.pb.realtime.subscribe('*', () => {
      this.updateConnectionStatus();
    });
    
    // Handle disconnect events
    this.updateConnectionStatus();
    
    this.logWithTimestamp('Realtime listeners setup complete');
  }
  
  private updateConnectionStatus() {
    const isConnected = this.pb.realtime.isConnected;
    const currentStatus = isConnected ? ConnectionStatus.Connected : ConnectionStatus.Disconnected;
    
    if (this.connectionStatusSubject.value !== currentStatus) {
      this.logWithTimestamp(`Connection status changed to: ${currentStatus}`);
      this.connectionStatusSubject.next(currentStatus);
    }
  }

  // Get current status synchronously
  public getCurrentStatus(): ConnectionStatus {
    return this.pb.realtime.isConnected ? ConnectionStatus.Connected : ConnectionStatus.Disconnected;
  }

  // Subscribe to a collection with user-specific filter
  public async subscribeToUserCollection(
    collectionName: string, 
    userId: string, 
    callback: (e: any) => void
  ) {
    try {
      // Subscribe to all records in collection that belong to the current user
      await this.pb.collection(collectionName).subscribe(`user_id="${userId}"`, callback);
      this.logWithTimestamp(`Subscribed to ${collectionName} for user ${userId}`);
      this.updateConnectionStatus();
    } catch (error) {
      this.logWithTimestamp(`Failed to subscribe to ${collectionName}:`, error);
      throw error;
    }
  }

  public async unsubscribe(collectionName: string, filter?: string) {
    try {
      if (filter) {
        await this.pb.collection(collectionName).unsubscribe(filter);
      } else {
        await this.pb.collection(collectionName).unsubscribe();
      }
      this.logWithTimestamp(`Unsubscribed from ${collectionName}${filter ? ` with filter ${filter}` : ''}`);
    } catch (error) {
      this.logWithTimestamp(`Failed to unsubscribe from ${collectionName}:`, error);
      throw error;
    }
  }

  // Cleanup method
  public destroy() {
    this.logWithTimestamp('Destroying manager...');
    this.pb.realtime.unsubscribe();
    this.connectionStatusSubject.complete();
  }
}

export default PocketBaseRealtimeManager;