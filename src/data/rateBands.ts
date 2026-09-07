import type { RateBand } from '../types';

/**
 * The ten cited MVP bands shipped with the app. The API is preferred, but the
 * quote screen can still work when a rehearsal database has not been seeded or
 * a worker temporarily loses connectivity. These are the same values and
 * citations as data/rate-bands.csv; sampleN stays zero so the UI never presents
 * the device copy as locally observed data.
 */
export const RATE_BAND_CATALOG: ReadonlyArray<RateBand> = [
  {
    trade: 'electrician', taskCode: 'fan_install', locality: '*', p25: 900, p50: 1200, p75: 1600,
    sampleN: 0, wageFloor: 862,
    seededFrom: 'CPWD DSR E&M BLDC fan item 1 full supply and installation Rs 2688; service band calibrated with Delhi Labour Dept order F.No.(142)/02/MW/VII/Part file/211-241 skilled Rs 862 per day effective 01/04/2025',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    trade: 'electrician', taskCode: 'fan_repair', locality: '*', p25: 862, p50: 1000, p75: 1400,
    sampleN: 0, wageFloor: 862,
    seededFrom: 'Delhi Labour Dept order F.No.(142)/02/MW/VII/Part file/211-241 skilled Rs 862 per day effective 01/04/2025; service band is a transparent MVP estimate not an official tariff',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    trade: 'electrician', taskCode: 'switchboard_install', locality: '*', p25: 900, p50: 1250, p75: 1800,
    sampleN: 0, wageFloor: 862,
    seededFrom: 'CPWD DSR E&M 2016 item 2.18 industrial socket with connections Rs 980; service band calibrated with Delhi Labour Dept order F.No.(142)/02/MW/VII/Part file/211-241 skilled Rs 862 per day',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    trade: 'electrician', taskCode: 'mcb_replace', locality: '*', p25: 862, p50: 1000, p75: 1400,
    sampleN: 0, wageFloor: 862,
    seededFrom: 'CPWD DSR E&M 2016 item 1706 SP MCB material Rs 117; service band includes skilled labour floor from Delhi Labour Dept order F.No.(142)/02/MW/VII/Part file/211-241 Rs 862 per day',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    trade: 'electrician', taskCode: 'light_fitting', locality: '*', p25: 862, p50: 1000, p75: 1500,
    sampleN: 0, wageFloor: 862,
    seededFrom: 'Delhi Labour Dept order F.No.(142)/02/MW/VII/Part file/211-241 skilled Rs 862 per day effective 01/04/2025; service band is a transparent MVP estimate not an official tariff',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    trade: 'plumber', taskCode: 'tap_replace', locality: '*', p25: 862, p50: 1050, p75: 1500,
    sampleN: 0, wageFloor: 862,
    seededFrom: 'CPWD DSR 2021 Vol II item 18.49.1 CP brass bib cock Rs 459.50; service band calibrated with Delhi Labour Dept order F.No.(142)/02/MW/VII/Part file/211-241 skilled Rs 862 per day',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    trade: 'plumber', taskCode: 'leak_repair', locality: '*', p25: 862, p50: 1100, p75: 1800,
    sampleN: 0, wageFloor: 862,
    seededFrom: 'Delhi Labour Dept order F.No.(142)/02/MW/VII/Part file/211-241 skilled Rs 862 per day effective 01/04/2025; service band is a transparent MVP estimate not an official tariff',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    trade: 'plumber', taskCode: 'toilet_install', locality: '*', p25: 1800, p50: 2600, p75: 3600,
    sampleN: 0, wageFloor: 862,
    seededFrom: 'CPWD DSR 2021 Vol II item 17.1.1 Indian type WC pan with cistern Rs 3392.80; service band is installation labour and consumables calibrated with Delhi skilled wage floor Rs 862 per day',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    trade: 'plumber', taskCode: 'water_tank_clean', locality: '*', p25: 862, p50: 1200, p75: 2000,
    sampleN: 0, wageFloor: 862,
    seededFrom: 'Delhi Labour Dept order F.No.(142)/02/MW/VII/Part file/211-241 skilled Rs 862 per day effective 01/04/2025; service band is a transparent MVP estimate not an official tariff',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    trade: 'plumber', taskCode: 'drain_unblock', locality: '*', p25: 862, p50: 1100, p75: 1800,
    sampleN: 0, wageFloor: 862,
    seededFrom: 'Delhi Labour Dept order F.No.(142)/02/MW/VII/Part file/211-241 skilled Rs 862 per day effective 01/04/2025; service band is a transparent MVP estimate not an official tariff',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

export const RATE_BAND_TASKS = RATE_BAND_CATALOG.map(({ trade, taskCode }) => ({ trade, taskCode }));

export function getCatalogRateBand(trade: string, taskCode: string): RateBand | null {
  return RATE_BAND_CATALOG.find((band) => band.trade === trade && band.taskCode === taskCode) ?? null;
}
