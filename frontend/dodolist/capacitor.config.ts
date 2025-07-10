import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cc.dodolist.app',
  appName: 'dodolist',
  webDir: 'dist',
  plugins: {
    Network: {
    }
  },
  server: {
    androidScheme: 'http'
  }
};

export default config;
