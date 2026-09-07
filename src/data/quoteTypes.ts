import type { SupportedLanguage } from '../types';

export interface SharedQuoteBand {
  p25: number;
  p50: number;
  p75: number;
  seededFrom?: string;
}

export interface SharedQuoteInput {
  language: SupportedLanguage;
  workerName: string;
  trade: string;
  tradeLabel: string;
  location: string;
  taskCode: string;
  taskLabel: string;
  labour: number;
  materials: number;
  visitCharge: number;
  band?: SharedQuoteBand;
}

export interface SharedQuoteRecord extends SharedQuoteInput {
  id: string;
  createdAt: string;
}
