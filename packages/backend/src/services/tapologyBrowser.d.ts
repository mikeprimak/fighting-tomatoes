import type { Browser, Page } from 'puppeteer';

export function launchTapologyBrowser(opts?: any): Promise<Browser>;
export function newTapologyPage(browser: Browser): Promise<Page>;
export function waitForCloudflareClear(
  page: Page,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<boolean>;
export function gotoTapology(page: Page, url: string, gotoOpts?: any): Promise<any>;
export function fetchTapologyHtml(
  url: string,
  opts?: { waitForSelector?: string; gotoOpts?: any }
): Promise<string>;
export const CHALLENGE_RE: RegExp;
export const DEFAULT_UA: string;
