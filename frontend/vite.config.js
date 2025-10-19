
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // --- ADD THIS server.proxy SECTION ---
  server: {
    port: 5173,
    host:true,
     // Ensure Vite runs on port 5173
    // Proxy API requests to the backend server
    proxy: {
      // Proxy all requests starting with '/api' to the backend
      '/api': {
        target: 'http://localhost:5001', // Your backend server URL
        changeOrigin: true,              // Needed for virtual hosted sites
        secure: false,                   // Set to true if your backend uses HTTPS
        // Rewriting the path is usually not needed if backend also uses /api
        // rewrite: (path) => path.replace(/^\/api/, ''), // Optional, if backend doesn't expect '/api' prefix
      },
    },
  },
  // --- END server.proxy SECTION ---
});