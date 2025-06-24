// API configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// PocketBase configuration
export const PB_URL = API_URL;
export const PB_ADMIN_URL = import.meta.env.VITE_ADMIN_URL || '/_/';

export default {
  API_URL,
  PB_URL,
  PB_ADMIN_URL
};
