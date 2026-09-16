import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), basicSsl()],
  server: {
    // Serve over https (self-signed cert) and bind to the LAN so a phone
    // can reach it — browsers only grant getUserMedia() camera access
    // (used for the nutrition-label scanner) on a secure origin.
    host: true,
  },
})
