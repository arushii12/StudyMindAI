// Import Vite helpers so this file can describe how the React app is built.
import { defineConfig } from "vite";
// Use the React plugin so Vite understands JSX and React refresh during development.
import react from "@vitejs/plugin-react";

// Export the Vite configuration used by npm run build and npm run client.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5001"
    }
  }
});
