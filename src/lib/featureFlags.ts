/// <reference types="vite/client" />

/**
 * USE_API - per-screen data source switch.
 *
 * Shipped by Track A on Day 3, three days before it is needed, because it is
 * the contingency for Day 6 and a contingency built on the day it is required
 * is not a contingency.
 *
 * WHY PER-SCREEN AND NOT A SINGLE BOOLEAN. Track B has seven screens to move
 * from localStorage to the API. As one atomic switch the app is broken for
 * however long that takes, which violates the runnable-every-day rule and
 * destroys the ability to demo mid-week. Per screen, B migrates one component
 * at a time and any single screen reverts in seconds.
 *
 * Set VITE_USE_API to a comma-separated list of screens, or `all`:
 *
 *   VITE_USE_API=""                  every screen on localStorage (default)
 *   VITE_USE_API="passport"          passport on the API, rest local
 *   VITE_USE_API="passport,jobs"     two screens on the API
 *   VITE_USE_API="all"               everything on the API
 *
 * Vite inlines this at BUILD time, so changing it needs a dev-server restart
 * or a rebuild - it cannot be flipped at runtime. That is deliberate: a flag
 * that can silently revert a screen mid-demo is the single worst failure mode
 * here, because the screen still renders and the data still looks plausible
 * while the team believes it is demonstrating a database it is not touching.
 *
 * DAY 9 REQUIRES A DECISION on this flag's state in the demo build, recorded
 * in DEMO_RUNBOOK.md, naming which screens are on the API and who may change it.
 */

export type ApiBackedScreen = 'home' | 'passport' | 'jobs' | 'kamai' | 'profile';

const ALL_SCREENS: ApiBackedScreen[] = ['home', 'passport', 'jobs', 'kamai', 'profile'];

/**
 * import.meta.env exists under Vite but not under plain Node, and this
 * directory is shared - ids.ts beside it is imported by the server. Reading it
 * defensively means a stray server-side import degrades to "all screens local"
 * instead of throwing a TypeError at module load, which would take the whole
 * server down at boot.
 */
const rawFlag =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_USE_API
    : process.env.VITE_USE_API;

const configured = new Set(
  String(rawFlag ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

/** Should this screen read from the API rather than localStorage? */
export function useApiFor(screen: ApiBackedScreen): boolean {
  return configured.has('all') || configured.has(screen);
}

/**
 * Which screens are currently API-backed. Exists so the Day 9 runbook decision
 * can be answered by running the build rather than by reading the source and
 * hoping - "which screens are on the API" is a finding if nobody can say.
 */
export function apiBackedScreens(): ApiBackedScreen[] {
  return ALL_SCREENS.filter(useApiFor);
}
