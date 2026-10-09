export type Pet = { id: string; label: string; color: string; startedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'pixel-pets': { frame: number; pets: Pet[]; celebrateUntil: number }
  }
}
