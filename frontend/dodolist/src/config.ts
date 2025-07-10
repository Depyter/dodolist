import { Capacitor } from '@capacitor/core';

const getBaseUrl = () => {
  if (Capacitor.isNativePlatform()) {
    // Use the specific IP of your development machine
    // Android emulator can access host machine's localhost via 10.0.2.2
    // For physical devices, use your machine's local network IP
    return 'http://192.168.10.156:8080';
  }
  // For web, we can use a relative path because of the proxy
  return "/";
};

const API_URL = getBaseUrl();
// PocketBase configuration
export const PB_URL = API_URL;
export const PB_ADMIN_URL = `${API_URL}/_/`; // Construct the full admin URL

export default {
  API_URL,
  PB_URL,
  PB_ADMIN_URL
};