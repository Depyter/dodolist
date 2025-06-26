const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) {
  throw new Error("Configuration Error: VITE_API_URL is not set.");
}

// PocketBase configuration
export const PB_URL = API_URL;
export const PB_ADMIN_URL = `${API_URL}/_/`; // Construct the full admin URL

export default {
  API_URL,
  PB_URL,
  PB_ADMIN_URL
};