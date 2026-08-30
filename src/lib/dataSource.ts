import { useApiFor, type ApiBackedScreen } from './featureFlags';

/**
 * Which DATA DOMAIN each screen reads, and therefore what USE_API switches.
 *
 * Owner: Track B. A separate module from featureFlags.ts, which Track A owns
 * and shipped - the flag's contract is theirs, this mapping onto App's state is
 * ours.
 *
 * THE PROBLEM THIS SOLVES. USE_API is per SCREEN, but App.tsx holds three
 * shared state slices, and several screens read the same slice: home shows all
 * three, passport and profile both read the profile, jobs reads jobs, kamai
 * reads entries. A slice cannot be half-migrated - it has one value.
 *
 * So a domain is API-backed when ANY screen that reads it is. That direction is
 * the safe one. The reverse - requiring every reader to be flagged - would let
 * one screen write to the database while another wrote the same slice to
 * localStorage, and the two would diverge silently while both looked correct.
 * Divergence in a money record is the failure this project cannot ship.
 *
 * The practical consequence, worth stating in the Day 9 runbook: setting
 * USE_API="home" pulls all three domains onto the API, because the dashboard
 * displays all three. It is not a smaller step than "all".
 */

export type DataDomain = 'profile' | 'jobs' | 'kamai';

const READERS: Record<DataDomain, ApiBackedScreen[]> = {
  profile: ['home', 'passport', 'profile'],
  jobs: ['home', 'jobs'],
  kamai: ['home', 'kamai'],
};

/** Should this data domain be read from and written to the API? */
export function useApiForDomain(domain: DataDomain): boolean {
  return READERS[domain].some(useApiFor);
}

/** True when any domain is API-backed - i.e. the app needs to load before it renders. */
export function anyDomainOnApi(): boolean {
  return (['profile', 'jobs', 'kamai'] as DataDomain[]).some(useApiForDomain);
}
