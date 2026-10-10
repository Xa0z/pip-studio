import fs from 'node:fs';
import type {Library} from './paths.js';

/** Where a library file came from. Files you add yourself have no entry and count as your own. */
export type Credit = {
  source: 'wikimedia' | 'archive' | 'pexels' | 'pixabay';
  id: string;
  title: string;
  query: string;
  author: string;
  license: string;
  licenseUrl: string;
  page: string; // the file's page, where anyone can check the licence
  url: string; // what was downloaded
  downloadedAt: string;
};

export function readCredits(l: Library): Record<string, Credit> {
  try {
    return JSON.parse(fs.readFileSync(l.credits, 'utf8'));
  } catch {
    return {};
  }
}

export function addCredit(l: Library, rel: string, c: Credit) {
  const all = readCredits(l);
  all[rel] = c;
  fs.writeFileSync(l.credits, JSON.stringify(all, null, 1));
}

/**
 * Only licences that allow reuse in a video without asking: CC0, public domain, plain CC BY
 * (credit needed, which credits.json records). Share-alike, non-commercial and no-derivatives are refused.
 */
export function allowedLicense(name: string, url = ''): boolean {
  const n = `${name} ${url}`.toLowerCase();
  if (/\b(nc|nd|sa)\b|-nc|-nd|-sa|noncommercial|no ?deriv|share ?alike|by-sa|by-nc|by-nd|gfdl|gpl|fair use|copyrighted/.test(n)) return false;
  return /cc0|cc-zero|publicdomain|public domain|\bpd\b|pdm|pd-|no known copyright|\bcc[- ]by\b|creativecommons\.org\/licenses\/by\/|pexels license|pixabay content license/.test(n);
}
