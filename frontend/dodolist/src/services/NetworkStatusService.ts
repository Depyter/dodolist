import { BehaviorSubject } from 'rxjs';
import { Network } from '@capacitor/network';

export type AppNetworkStatus = 'online' | 'offline';

class NetworkStatusService {
  private statusSubject = new BehaviorSubject<AppNetworkStatus>('online');
  public status$ = this.statusSubject.asObservable();

  constructor() {
    const isCapacitor = !!(window && (window as any).Capacitor);

    if (isCapacitor) {
      Network.addListener('networkStatusChange', status => {
        this.statusSubject.next(status.connected ? 'online' : 'offline');
      });
      Network.getStatus().then(status => {
        this.statusSubject.next(status.connected ? 'online' : 'offline');
      });
    } else {
      window.addEventListener('online', () => this.statusSubject.next('online'));
      window.addEventListener('offline', () => this.statusSubject.next('offline'));
      this.statusSubject.next(navigator.onLine ? 'online' : 'offline');
    }
  }

  get currentStatus(): AppNetworkStatus {
    return this.statusSubject.value;
  }
}

export const networkStatusService = new NetworkStatusService();
