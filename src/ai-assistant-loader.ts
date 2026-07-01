/**
 * API Key Loader — Vite-aware key injection for the public/ai-assistant page.
 *
 * Because files in public/ are served as-is (not processed through Vite's
 * module bundler), import.meta.env is unavailable inside them. This script
 * is processed by Vite and exposes the key as a global window variable that
 * main.js can read at runtime.
 *
 * Place: src/ai-assistant-loader.ts
 * Output: injected as <script type="module"> from the HTML entry point via
 * Vite's rollupOptions.input, OR referenced as a separate asset.
 *
 * NOTE: We actually use a different approach — we create a dynamic script
 * endpoint via vite.config.ts that writes the key. See vite-key-plugin.ts.
 * This file is the fallback stub that writes directly to window.
 */

// This file is intentionally empty — key injection is handled by
// the inline <script> in index.html generated from the Vite config plugin.
// See: vite.config.ts → NvidiaKeyPlugin
export {};
