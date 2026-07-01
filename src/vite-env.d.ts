/// <reference types="vite/client" />

/**
 * Global variable injected at runtime by nvidiaKeyPlugin (vite.config.ts).
 * Populated from VITE_AI_API_KEY in .env via the /ai-assistant/env.js endpoint.
 * Consumed exclusively by public/ai-assistant/main.js — resolveApiKey().
 */
declare const __NVIDIA_API_KEY__: string | undefined;