import type { YearData } from '../model';
import { YEAR_2024 } from './2024';
import { YEAR_2025 } from './2025';

const TABLES: Record<number, YearData> = { 2024: YEAR_2024, 2025: YEAR_2025 };

export const LATEST_TAX_YEAR = Math.max(...Object.keys(TABLES).map(Number));
export const SUPPORTED_YEARS = Object.keys(TABLES).map(Number).sort((a, b) => b - a);

/** The data table for a year, falling back to the latest available. */
export function yearData(year: number): YearData {
  return TABLES[year] ?? TABLES[LATEST_TAX_YEAR]!;
}
