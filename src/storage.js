// Device-local preferences and scores only. No requests or identifiers.
const KEY = 'ad-to-play:neon:v4';
const LEGACY_KEY = 'ad-to-play:neon:v3';
export const DEFAULTS = Object.freeze({ muted: true, vibration: false, reducedMotion: null, records: {} });
export function readSaved(storage) {
  try {
    const current = storage?.getItem(KEY);
    const value = JSON.parse(current || storage?.getItem(LEGACY_KEY) || 'null');
    const legacy = !current;
    if (!value || typeof value !== 'object') return { ...DEFAULTS, records: {} };
    const records = {};
    for (const [id, record] of Object.entries(legacy ? {} : value.records || {}).slice(0, 20)) {
      if (!record || typeof record !== 'object') continue;
      records[id] = {
        wins: Math.max(0, Math.min(999999, Math.floor(Number(record.wins) || 0))),
        bestTime: Number.isFinite(record.bestTime) && record.bestTime > 0 && record.bestTime <= 120 ? record.bestTime : null,
        progress: Math.max(0, Math.min(1, Number(record.progress) || 0)),
        maxSquad: Math.max(0, Math.min(42, Math.floor(Number(record.maxSquad) || 0))),
      };
    }
    return { muted: value.muted !== false, vibration: value.vibration === true, reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : null, records };
  } catch { return { ...DEFAULTS, records: {} }; }
}
export function writeSaved(storage, value) { try { storage?.setItem(KEY, JSON.stringify(value)); return Boolean(storage); } catch { return false; } }
export function recordRun(saved, result) {
  if (!result || !result.levelId) return saved;
  const old = saved.records[result.levelId] || { wins: 0, bestTime: null, progress: 0, maxSquad: 0 };
  const next = { ...old, wins: old.wins + (result.won ? 1 : 0), progress: Math.max(old.progress, result.progress || 0), maxSquad: Math.max(old.maxSquad, result.maxSquad || result.squad || 0) };
  if (result.won) next.bestTime = old.bestTime === null ? result.time : Math.min(old.bestTime, result.time);
  return { ...saved, records: { ...saved.records, [result.levelId]: next } };
}
