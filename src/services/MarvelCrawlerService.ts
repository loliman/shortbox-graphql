import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { request } from "undici";

/* =====================
 * Public (your) types
 * ===================== */

export interface CrawledSeries {
  title: string;
  volume: number;
  startyear: number;
  endyear: number;
  publisherName: string;
  genre?: string;
}

export interface CrawledStory {
  number: number;
  title: string;
  addinfo?: string;
  part?: string;
  reprintOf?: CrawledStoryReference;
  individuals?: CrawledIndividual[];
  appearances?: CrawledAppearance[];
}

export interface CrawledStoryReference {
  number?: number;
  issue: {
    number: string;
    series: {
      title: string;
      volume: number;
    };
  };
}

export interface CrawledIssue {
  number: string;
  legacyNumber?: string;
  releasedate: string;
  price: number;
  currency: string;
  variant?: string;
  format?: string;
  series?: {
    title: string;
    volume: number;
    startyear?: number;
    endyear?: number;
    genre?: string;
    publisher?: {
      name: string;
    };
  };
  stories: CrawledStory[];
  cover?: CrawledCover;
  variants?: unknown[];
  individuals?: CrawledIndividual[];
  arcs?: CrawledArc[];
  collectedIssues?: CrawledIssueReference[];
  containedIssues?: CrawledIssueReference[];
}

export interface CrawledIssueReference {
  number: string;
  storyTitle?: string;
  series: {
    title: string;
    volume: number;
  };
}

export interface CrawledAppearance {
  name: string;
  type: string;
  role?: string;
  firstapp?: boolean;
}

export interface CrawledArc {
  title: string;
  type: string;
}

export interface CrawledIndividual {
  name: string;
  type: string;
}

export interface CrawledCover {
  number: number;
  url?: string;
  individuals: CrawledIndividual[];
}

type PageTitleResolution = {
  requestedPageTitle: string;
  resolvedPageTitle: string;
};

type CrawlIssueOptions = {
  pageTitleResolution?: PageTitleResolution;
};

/* ==================
 * Internal constants
 * ================== */

const WIKI_BASE = "https://marvel.fandom.com";
const API = `${WIKI_BASE}/api.php`;
const USER_AGENT = "shortbox-crawler/1.1 (+https://shortbox.de)";
const seriesCache = new Map<string, Promise<CrawledSeries>>();
const pageTitleResolutionCache = new Map<string, Promise<PageTitleResolution>>();
const HTTP_MAX_ATTEMPTS = 2;
const HTTP_RETRY_DELAY_MS = 2500;
const STORY_TITLE_MAX_LENGTH = 255;
const APPEARANCE_NAME_MAX_LENGTH = 255;
const RETRYABLE_HTTP_STATUS_CODES = new Set([429, 500, 502, 503, 504, 520, 522, 524]);
const RETRYABLE_HTTP_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/* =========
 * Utilities
 * ========= */

function ws(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeCrawlerEntityValue(raw: string): string {
  const normalized = ws(
    String(raw || "")
      .replace(/[\u00A0\u2007\u202F]/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[‘’`´]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[‐‑–—]/g, "-")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")"),
  );
  if (!normalized) return "";

  return normalized
    .split(" ")
    .map((token) => (token && /^[a-z]/.test(token) ? `${token[0].toUpperCase()}${token.slice(1)}` : token))
    .join(" ");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function isRetryableHttpStatus(statusCode: number): boolean {
  return RETRYABLE_HTTP_STATUS_CODES.has(statusCode);
}

function isRetryableRequestError(error: unknown): boolean {
  return RETRYABLE_HTTP_ERROR_CODES.has(getErrorCode(error));
}

async function requestTextWithRetry(
  url: string,
  headers: Record<string, string>,
): Promise<{ statusCode: number; text: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < HTTP_MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await request(url, { headers });
      const text = await res.body.text();

      if (attempt + 1 < HTTP_MAX_ATTEMPTS && isRetryableHttpStatus(res.statusCode)) {
        await wait(HTTP_RETRY_DELAY_MS);
        continue;
      }

      return { statusCode: res.statusCode, text };
    } catch (error) {
      lastError = error;
      if (attempt + 1 < HTTP_MAX_ATTEMPTS && isRetryableRequestError(error)) {
        await wait(HTTP_RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed for ${url}`);
}

function normalizeWikiHref(value: string | null | undefined): string {
  return ws(String(value || "")).replace(/^https?:\/\/[^/]+/i, "");
}

function isWikiHref(value: string | null | undefined): boolean {
  return normalizeWikiHref(value).startsWith("/wiki/");
}

function extractWikiTitleFromHref(value: string | null | undefined): string {
  const normalizedHref = normalizeWikiHref(value);
  if (!normalizedHref.startsWith("/wiki/")) return "";

  const withoutPrefix = normalizedHref.replace(/^\/wiki\//, "");
  const withoutFragment = withoutPrefix.split("#")[0];
  const withoutQuery = withoutFragment.split("?")[0];
  if (!withoutQuery) return "";

  let decoded = withoutQuery.replace(/_/g, " ");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = withoutQuery.replace(/_/g, " ");
  }
  return ws(decoded);
}

function normalizeEntityNameFromWikiHref(value: string | null | undefined): string {
  const title = extractWikiTitleFromHref(value);
  if (!title) return "";
  if (title.includes(":")) return "";
  if (!/[A-Za-z0-9]/.test(title)) return "";
  return normalizeCrawlerEntityValue(title);
}

function collectNormalizedEntityNamesFromLinks(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<AnyNode>,
): string[] {
  const deduped = new Map<string, string>();

  scope.find("a[href^='/wiki/']").each((_, el) => {
    const linkText = ws($(el).text());
    if (linkText && !/[A-Za-z0-9]/.test(linkText)) return;

    const normalizedName = normalizeEntityNameFromWikiHref($(el).attr("href"));
    if (!normalizedName) return;
    const key = normalizedName.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, normalizedName);
  });

  return Array.from(deduped.values());
}

function extractPrimaryEntityNameFromListItem($: cheerio.CheerioAPI, li: AnyNode): string {
  const item = $(li).clone();
  item.find("ul, ol").remove();
  const eligibleLinks = item.find("a[href^='/wiki/']");
  if (!eligibleLinks.length) return "";

  const textPreferred = eligibleLinks.filter((_, el) => /[A-Za-z0-9]/.test(ws($(el).text()))).first();
  const primary = textPreferred.length ? textPreferred : eligibleLinks.first();
  return normalizeEntityNameFromWikiHref(primary.attr("href"));
}

function normalizeHeader(s: string) {
  // "Writer(s)" => "writer", "Original Price" => "original price"
  return ws(s)
    .toLowerCase()
    .replace(/\(s\)/g, "") // writer(s) -> writer
    .replace(/[:\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLower(s: string) {
  return ws(s).toLowerCase();
}

function normalizeIndividualType(type: string) {
  const normalized = normalizeHeader(type);
  if (normalized === "coverartist") return "ARTIST";
  if (normalized === "editorinchief") return "EDITOR";
  return normalized.replace(/\s+/g, "").toUpperCase();
}

function normalizeAppearanceType(typeRaw: string): string {
  const normalized = normalizeHeader(typeRaw).replace(/:$/, "");
  if (!normalized) return "CHARACTER";

  if (/(realit|dimension|timeline|multiverse|earth-\d+)/i.test(normalized)) return "REALITY";
  if (/(location|place|setting|city|country|planet|world|realm)/i.test(normalized)) return "LOCATION";
  if (/(item|object|artifact|weapon|device|accessor|iten)/i.test(normalized)) return "ITEM";
  if (/(vehicle|ship|aircraft|car|truck|train|jet|vechi)/i.test(normalized)) return "VEHICLE";
  if (/(race|species|peoples|races)/i.test(normalized)) return "RACE";
  if (/(organization|organisation|agency|corporation|guild|order|syndicate)/i.test(normalized))
    return "ORGANIZATION";
  if (/(group|team|allies|foes|villains|heroes|guests|crew|droids|robots)/i.test(normalized))
    return "GROUP";
  if (/(event|storyline|arc|saga)/i.test(normalized)) return "EVENT";
  if (/(animal|animals|beast|creature)/i.test(normalized)) return "ANIMAL";

  return "CHARACTER";
}

function normalizeAppearanceRole(roleRaw: string): string | undefined {
  const normalized = normalizeHeader(roleRaw).replace(/:$/, "");
  if (!normalized) return undefined;

  if (/(featured|main)/i.test(normalized)) return "FEATURED";
  if (/(support)/i.test(normalized)) return "SUPPORTING";
  if (/(antagon|villain)/i.test(normalized)) return "ANTAGONIST";
  if (/(other)/i.test(normalized)) return "OTHER";
  return undefined;
}

function toUnderscoreTitle(s: string) {
  return s.trim().replace(/ /g, "_");
}

function buildSeriesPageTitle(seriesTitle: string, volume: number) {
  return `${toUnderscoreTitle(seriesTitle)}_Vol_${volume}`;
}

function buildIssuePageTitle(seriesTitle: string, volume: number, issueNumber: string) {
  return `${toUnderscoreTitle(seriesTitle)}_Vol_${volume}_${toUnderscoreTitle(issueNumber)}`;
}

function parseIssuePageTitle(pageTitle: string): { seriesTitle: string; volume: number; issueNumber: string } | null {
  const raw = ws(pageTitle);
  const match = raw.match(/^(.*?)(?:_|\s)Vol(?:_|\s)(\d+)(?:_|\s)(.+)$/i);
  if (!match) return null;
  return {
    seriesTitle: ws(match[1].replace(/_/g, " ")),
    volume: Number(match[2]),
    issueNumber: ws(match[3].replace(/_/g, " ")),
  };
}

function parseSeriesPageTitle(pageTitle: string): { seriesTitle: string; volume: number } | null {
  const raw = ws(pageTitle);
  const match = raw.match(/^(.*?)(?:_|\s)Vol(?:_|\s)(\d+)$/i);
  if (!match) return null;
  return {
    seriesTitle: ws(match[1].replace(/_/g, " ")),
    volume: Number(match[2]),
  };
}

function normalizeTitleKey(value: string): string {
  return ws(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function canonicalSeriesTitle(value: string): string {
  const normalized = ws(value)
    .replace(/_/g, " ")
    .replace(/\s*\/\s*/g, " and ")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+(HC|TPB|SC|GN|OGN)$/i, "");
  if (normalizeTitleKey(normalized) === "marvelpointone") return "Point One";
  if (normalizeTitleKey(normalized) === "allnewalldifferentmarvelpointone") {
    return "All-New, All-Different Point One";
  }
  if (normalizeTitleKey(normalized) === "marvelcomicssuperspecial") return "Marvel Super Special";
  return normalized;
}

function normalizeWikiTitleForComparison(value: string): string {
  return ws(value).replace(/_/g, " ").toLowerCase();
}

function normalizeIssueNumberKey(value: string): string {
  const normalized = ws(value)
    .replace(/^([0-9]+[a-z.]*)\s*:\s+.*$/i, "$1")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/a\.i\./g, "ai")
    .replace(/\s+/g, "");
  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractContainedIssueStoryTitleFromCaption(
  $: cheerio.CheerioAPI,
  caption: cheerio.Cheerio<AnyNode>,
): string {
  if (!caption.length) return "";

  const lastLink = caption.find("a[href^='/wiki/']").last();
  if (!lastLink.length) return "";

  const fragments: string[] = [];
  let node = (lastLink.get(0) as AnyNode | null)?.nextSibling || null;
  while (node) {
    const text = ws($(node).text());
    if (text) fragments.push(text);
    node = (node as AnyNode).nextSibling || null;
  }

  const trailingText = ws(fragments.join(" ").replace(/^["“”']+|["“”']+$/g, ""));
  if (trailingText) return trailingText;

  const captionText = ws(caption.text());
  return captionText;
}

async function apiGet(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const url = `${API}?${qs.toString()}`;

  const { statusCode, text } = await requestTextWithRetry(url, { "user-agent": USER_AGENT });

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`API ${statusCode} for ${url}\n${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function resolvePageTitle(
  pageTitle: string,
  providedResolution?: PageTitleResolution,
): Promise<PageTitleResolution> {
  const requestedPageTitle = ws(pageTitle);
  if (
    providedResolution?.resolvedPageTitle &&
    normalizeWikiTitleForComparison(providedResolution.requestedPageTitle) ===
      normalizeWikiTitleForComparison(requestedPageTitle)
  ) {
    return {
      requestedPageTitle,
      resolvedPageTitle: ws(providedResolution.resolvedPageTitle),
    };
  }

  const cached = pageTitleResolutionCache.get(requestedPageTitle);
  if (cached) return cached;

  const pending = (async (): Promise<PageTitleResolution> => {
    try {
      const probe = await apiGet({
        action: "query",
        redirects: "1",
        titles: requestedPageTitle,
      });
      const pages = probe?.query?.pages || [];
      const page = Array.isArray(pages) ? pages[0] : null;
      if (page && !("missing" in page)) {
        return {
          requestedPageTitle,
          resolvedPageTitle: ws(page.title || requestedPageTitle),
        };
      }
    } catch {
      // fall through to exact not found
    }
    throw new Error(`No parse.text for page "${requestedPageTitle}"`);
  })();

  pageTitleResolutionCache.set(requestedPageTitle, pending);
  try {
    return await pending;
  } catch (error) {
    pageTitleResolutionCache.delete(requestedPageTitle);
    throw error;
  }
}

async function loadParsedHtml(pageTitle: string): Promise<string | null> {
  const data = await apiGet({
    action: "parse",
    page: pageTitle,
    prop: "text|sections",
  });

  return data?.parse?.text ? String(data.parse.text) : null;
}

async function parsePageHtmlByTitle(
  pageTitle: string,
  pageTitleResolution?: PageTitleResolution,
): Promise<cheerio.CheerioAPI> {
  const resolvedPage = await resolvePageTitle(pageTitle, pageTitleResolution);
  const resolvedHtml = await loadParsedHtml(resolvedPage.resolvedPageTitle);

  if (!resolvedHtml) throw new Error(`No parse.text for page "${resolvedPage.resolvedPageTitle}"`);
  return cheerio.load(resolvedHtml);
}

function addUniqueIndividual(out: CrawledIndividual[], name: string, type: string) {
  const normalizedName = normalizeCrawlerEntityValue(name);
  if (!normalizedName) return;
  const normalizedType = normalizeIndividualType(type);
  const k = `${normalizedType}::${normalizedName}`.toLowerCase();
  if (!out.some((i) => `${i.type}::${i.name}`.toLowerCase() === k)) {
    out.push({ name: normalizedName, type: normalizedType });
  }
}

function addUniqueAppearance(out: CrawledAppearance[], a: CrawledAppearance) {
  const name = normalizeCrawlerEntityValue(a.name);
  if (!name || name.length > APPEARANCE_NAME_MAX_LENGTH) return;
  const normalizedType = normalizeAppearanceType(a.type);
  if (normalizedType === "REALITY") return;
  const candidate: CrawledAppearance = {
    ...a,
    name,
    type: normalizedType,
    role: normalizedType === "CHARACTER" && a.role ? normalizeAppearanceRole(a.role) : undefined,
  };
  const k = `${candidate.type}::${candidate.role || ""}::${candidate.name}`.toLowerCase();
  if (!out.some((x) => `${x.type}::${x.role || ""}::${x.name}`.toLowerCase() === k)) {
    out.push(candidate);
  }
}

function splitListNames(raw: string | null): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/\n|,|•|·| and /gi)
    .map(normalizeCrawlerEntityValue)
    .filter(Boolean);

  const deduped = new Map<string, string>();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, part);
  }
  return Array.from(deduped.values());
}

function cleanAppearanceName(raw: string): string {
  let value = ws(raw.replace(/[⏴⏵]/g, " "));

  // Remove trailing contextual/status markers while preserving identity parentheses,
  // e.g. "Binary (Carol Danvers) (Joins)" -> "Binary (Carol Danvers)".
  const removableSuffixes = new Set([
    "joins",
    "leaves",
    "mentioned",
    "referenced",
    "invoked",
    "illusion",
    "illusion and recap",
    "drawing in illusion and appears in recap",
    "behind the scenes in recap",
    "main story and recap",
    "main story and flashback",
    "main story and behind the scenes in flashback",
    "only in recap",
    "appears in recap",
    "only on screen as a static image or video record",
    "on-screen in flashback",
    "appears as a statue in recap",
    "impersonates moon knight on-screen in illusion in main story",
    "in thor's thoughts only",
    "first appearance",
    "only appearance",
    "appears in flashback",
    "only in flashback",
    "only in flashback unnamed",
    "see chronology",
    "mentioned in narration or thoughts",
    "appears on screen",
    "photo",
    "cameo",
    "name revealed",
    "voice only",
    "revealed to be alive",
    "resurrection",
    "death",
    "death of several",
    "death of multiple",
    "corpse skeleton or other remains",
    "topical reference",
    "origin revealed",
    "deceased",
    "destroyed",
    "destruction",
    "apparent death",
    "apparent destruction",
    "temporarily enthralled by the countess",
    "enthralled by the countess",
    "freed from the countess thrall",
    "freed from the countess' thrall",
    "as a hologram",
    "as a hologram death",
    "as a hologram destruction",
    "grave only",
    "last appearance",
    "first full appearance",
    "unnamed",
  ]);

  while (true) {
    const match = value.match(/\s*\(([^()]+)\)\s*$/);
    if (!match) break;
    const normalized = normalizeHeader(match[1]);
    if (!removableSuffixes.has(normalized)) break;
    value = ws(value.slice(0, value.length - match[0].length));
  }

  value = ws(
    value.replace(/\(([^()]+)\)/g, (full, inner) => {
      const normalized = normalizeHeader(inner);
      for (const suffix of removableSuffixes) {
        if (normalized.includes(suffix)) return "";
      }
      const contextualKeywords = [
        "reference",
        "recap",
        "flashback",
        "illusion",
        "on screen",
        "on-screen",
        "behind the scenes",
        "appears as",
        "appears in",
        "impersonates",
        "statue",
        "drawing",
        "photo",
        "cameo",
        "death",
        "destruction",
        "last appearance",
        "first full appearance",
        "name revealed",
        "voice only",
        "revealed to be alive",
        "resurrection",
        "enthralled",
        "freed from",
        "hologram",
        "grave only",
      ];
      if (contextualKeywords.some((keyword) => normalized.includes(keyword))) return "";
      return full;
    }),
  );

  return value;
}

function parsePrice(raw: string | null): { price: number; currency: string } {
  if (!raw) return { price: 0, currency: "" };
  const symbolMatch = raw.match(/([€$£])\s*([0-9]+(?:\.[0-9]+)?)/);
  if (symbolMatch) {
    const currencyBySymbol: Record<string, string> = {
      "$": "USD",
      "€": "EUR",
      "£": "GBP",
    };
    return {
      currency: currencyBySymbol[symbolMatch[1]] || "",
      price: Number(symbolMatch[2]),
    };
  }

  const codeMatch = raw.match(/\b([A-Z]{3})\b\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (codeMatch) {
    return { currency: codeMatch[1].toUpperCase(), price: Number(codeMatch[2]) };
  }

  return { price: 0, currency: "" };
}

function formatReleaseDate(raw: string | null): string {
  const value = ws(raw || "");
  if (!value) return "";

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;

  const monthMatch = value.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (monthMatch) {
    const monthByName: Record<string, string> = {
      january: "01",
      february: "02",
      march: "03",
      april: "04",
      may: "05",
      june: "06",
      july: "07",
      august: "08",
      september: "09",
      october: "10",
      november: "11",
      december: "12",
    };
    const month = monthByName[monthMatch[1].toLowerCase()];
    if (month) {
      return `${monthMatch[2].padStart(2, "0")}.${month}.${monthMatch[3]}`;
    }
  }

  return value;
}

function normalizeLegacyNumber(raw: string | null): string | null {
  const value = ws(raw || "").replace(/^LGY:\s*/i, "");
  if (!value) return null;

  const hashMatch = value.match(/#\s*([A-Za-z0-9./-]+)/);
  if (hashMatch) return ws(hashMatch[1]);

  const directMatch = value.match(/^([A-Za-z0-9./-]+)$/);
  if (directMatch) return ws(directMatch[1]);

  return null;
}

function parseYearRange(raw: string | null): { startyear: number; endyear: number } {
  if (!raw) return { startyear: 0, endyear: 0 };
  const years = raw.match(/\d{4}/g) || [];
  if (years.length === 0) return { startyear: 0, endyear: 0 };
  if (years.length === 1) {
    const year = Number(years[0]);
    return { startyear: year, endyear: year };
  }
  return { startyear: Number(years[0]), endyear: Number(years[years.length - 1]) };
}

/* =====================================
 * H3 blocks (Issue Details etc.)
 * ===================================== */

function h3BlockValueText($: cheerio.CheerioAPI, headerWanted: string): string | null {
  const want = normalizeHeader(headerWanted);

  const h3 = $("h3")
    .filter((_, el) => normalizeHeader($(el).text()) === want)
    .first();

  if (!h3.length) return null;

  const chunk = h3.nextUntil("h3, h2");
  const txt = ws(chunk.text());
  return txt || null;
}

function h3BlockLinksText($: cheerio.CheerioAPI, headerWanted: string): string[] {
  const want = normalizeHeader(headerWanted);

  const h3 = $("h3")
    .filter((_, el) => normalizeHeader($(el).text()) === want)
    .first();

  if (!h3.length) return [];

  const chunk = h3.nextUntil("h3, h2");
  return collectNormalizedEntityNamesFromLinks($, chunk);
}

/* =====================================
 * Portable infobox (fallback)
 * ===================================== */

function infoboxRows($: cheerio.CheerioAPI) {
  return $(".portable-infobox .pi-data").toArray();
}

function infoboxValueText($: cheerio.CheerioAPI, label: string): string | null {
  const want = normalizeHeader(label);
  for (const el of infoboxRows($)) {
    const lbl = normalizeHeader($(el).find(".pi-data-label").text());
    if (lbl === want) {
      const val = ws($(el).find(".pi-data-value").text());
      return val || null;
    }
  }
  return null;
}

function infoboxTopImageUrl($: cheerio.CheerioAPI): string | null {
  const img = $(".portable-infobox figure.pi-item.pi-image img").first();
  const src = img.attr("src") || img.attr("data-src");
  return src ? normalizeImageUrl(src) : null;
}

function infoboxTopImageFileTitle($: cheerio.CheerioAPI): string | null {
  const imageLink = $(".portable-infobox figure.pi-item.pi-image a")
    .filter((_, el) => isWikiHref($(el).attr("href")))
    .first();
  const href = normalizeWikiHref(imageLink.attr("href")).replace(/^\/wiki\//, "");
  if (/^File:/i.test(href)) return href;
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(href)) return `File:${href.replace(/^File:/i, "")}`;

  const image = $(".portable-infobox figure.pi-item.pi-image img").first();
  const imageName = ws(
    String(image.attr("data-image-name") || image.attr("data-image-key") || "").replace(/^File:/i, ""),
  );
  return imageName ? `File:${imageName}` : null;
}

function inlineLabelValueText($: cheerio.CheerioAPI, label: string): string | null {
  const want = normalizeHeader(label);

  const labelSpan = $("span")
    .filter((_, el) => normalizeHeader($(el).text()) === want)
    .first();

  if (!labelSpan.length) return null;
  const container = labelSpan.parent();
  if (!container.length) return null;

  const linkValues = Array.from(
    new Set(
      container
        .find("a[href^='/wiki/']")
        .map((_, el) => ws($(el).text()))
        .get()
        .filter(Boolean) as string[],
    ),
  );
  if (linkValues.length > 0) return linkValues.join(", ");

  const clone = container.clone();
  clone.find("span").first().remove();
  const value = ws(clone.text());
  return value || null;
}

function parseLegacyNumber($: cheerio.CheerioAPI): string | null {
  const fromLabels =
    normalizeLegacyNumber(h3BlockValueText($, "LGY")) ??
    normalizeLegacyNumber(h3BlockValueText($, "Legacy Number")) ??
    normalizeLegacyNumber(infoboxValueText($, "LGY")) ??
    normalizeLegacyNumber(infoboxValueText($, "Legacy Number")) ??
    normalizeLegacyNumber(inlineLabelValueText($, "LGY")) ??
    normalizeLegacyNumber(inlineLabelValueText($, "Legacy Number"));

  if (fromLabels) return fromLabels;

  const fallback = $("span, div, p, li, td")
    .map((_, el) => ws($(el).text()))
    .get()
    .find((text) => /^LGY:\s*.+/i.test(text));

  return normalizeLegacyNumber(fallback || null);
}

/* ======================
 * Stories / credits logic
 * ====================== */

type StoryKey = {
  number: number;
  headingText: string; // e.g. 1. "Foo" OR 1st story
  title: string;
  h2El: Element;
};

function cleanStoryTitle(raw: string): string {
  let value = ws(raw);
  while (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('“') && value.endsWith('”'))
  ) {
    value = ws(value.slice(1, -1));
  }
  const quotedWithSuffix = value.match(/^["“](.+?)["”](\s*(?:•|\().*)?$/);
  if (quotedWithSuffix) {
    value = ws(`${quotedWithSuffix[1]}${quotedWithSuffix[2] || ''}`);
  }
  if (value.length > STORY_TITLE_MAX_LENGTH) {
    value = value.slice(0, STORY_TITLE_MAX_LENGTH).trim();
  }
  return value;
}

function findStories($: cheerio.CheerioAPI): StoryKey[] {
  const out: StoryKey[] = [];

  $("h2").each((_, el) => {
    const t = ws($(el).text());

    // A) 1. "Story Title"
    const mA = t.match(/^(\d+)\.\s*["“](.+?)["”]\s*$/);
    if (mA) {
      out.push({ number: Number(mA[1]), headingText: t, title: cleanStoryTitle(mA[2]), h2El: el });
      return;
    }

    // B) 1st story / 2nd story / ... or 1st profile / 2nd profile / ...
    const mB = t.match(/^(\d+)(st|nd|rd|th)\s+(story|profile)$/i);
    if (mB) {
      out.push({ number: Number(mB[1]), headingText: t, title: cleanStoryTitle(t), h2El: el });
      return;
    }
  });

  out.sort((a, b) => a.number - b.number);
  return out;
}

function nextUntilH2Nodes(startEl: Element): AnyNode[] {
  const nodes: AnyNode[] = [];
  let cur = (startEl as any).nextSibling;
  while (cur) {
    if ((cur as any).name === "h2") break;
    nodes.push(cur as any);
    cur = (cur as any).nextSibling;
  }
  return nodes;
}

function parseStoryIndividualsFromBlock(htmlFragment: string): CrawledIndividual[] {
  const $$ = cheerio.load(`<root>${htmlFragment}</root>`);
  const individuals: CrawledIndividual[] = [];

  const capture = (needleHeader: string, type: string) => {
    const want = normalizeHeader(needleHeader);

    const h = $$("h3")
      .filter((_, el) => normalizeHeader($$(el).text()).includes(want))
      .first();
    if (!h.length) return;

    const chunk = h.nextUntil("h3, h2");
    const linkNames = collectNormalizedEntityNamesFromLinks($$, chunk);

    if (linkNames.length > 0) {
      for (const name of linkNames) addUniqueIndividual(individuals, name, type);
    }
  };

  capture("Writer", "writer");
  capture("Penciler", "penciler");
  capture("Inker", "inker");
  capture("Colorist", "colorist");
  capture("Letterer", "letterer");
  capture("Editor", "editor");

  return individuals;
}

function parseStoryReprintOfFromBlock(htmlFragment: string): CrawledStoryReference | undefined {
  const $$ = cheerio.load(`<root>${htmlFragment}</root>`);
  const reprintNode = $$("[data-source^='ReprintOf']").first();
  if (!reprintNode.length) return undefined;

  const text = ws(reprintNode.text());
  const storyMatch = text.match(/Reprint of the\s+(\d+)(st|nd|rd|th)\s+story\s+from/i);
  const anchor = reprintNode.find("a[href^='/wiki/']").first();
  const href = anchor.attr("href") || "";
  const pageTitle = ws(href.replace(/^\/wiki\//, ""));
  const parsedIssue = parseIssuePageTitle(pageTitle);
  if (!parsedIssue) return undefined;

  return {
    number: storyMatch ? Number(storyMatch[1]) : undefined,
    issue: {
      number: parsedIssue.issueNumber,
      series: {
        title: parsedIssue.seriesTitle,
        volume: parsedIssue.volume,
      },
    },
  };
}

/* =======================
 * Appearances per story
 * ======================= */

function parseAppearancesForStory($: cheerio.CheerioAPI, story: StoryKey): CrawledAppearance[] {
  // Looks for H2 "Appearing in ..." containing story title or heading text
  const storyLower = story.title.toLowerCase();
  let h2El: Element | null = null;

  $("h2").each((_, el) => {
    const t = ws($(el).text()).toLowerCase();
    if (!t.includes("appearing in")) return;

    if (t.includes(storyLower) || t.includes(story.headingText.toLowerCase())) {
      h2El = el;
    }
  });

  if (!h2El) return [];

  const nodes = nextUntilH2Nodes(h2El);
  const $$ = cheerio.load(`<root>${nodes.map((n) => $.html(n)).join("")}</root>`);
  const out: CrawledAppearance[] = [];

  const normalizeAppearanceCategory = (lbl: string): { type: string; role?: string } => {
    const type = normalizeAppearanceType(lbl);
    const role = type === "CHARACTER" ? normalizeAppearanceRole(lbl) : undefined;
    return { type, role };
  };

  const extractListItemText = ($$: cheerio.CheerioAPI, li: AnyNode): string => {
    const linked = extractPrimaryEntityNameFromListItem($$, li);
    if (!linked) return "";
    return cleanAppearanceName(linked);
  };

  const collectAppearanceListItems = (
    $$: cheerio.CheerioAPI,
    list: cheerio.Cheerio<AnyNode>,
    category: { type: string; role?: string },
  ) => {
    list.children("li").each((__, li) => {
      const nestedLists = $$(li).children("ul, ol");
      if (nestedLists.length > 0) {
        nestedLists.each((___, nested) => {
          collectAppearanceListItems($$, $$(nested), category);
        });
        return;
      }

      const name = extractListItemText($$, li);
      if (!name) return;
      addUniqueAppearance(out, { name, type: category.type, role: category.role });
    });
  };

  // Standard structure: bold label then list
  $$("b, strong").each((_, el) => {
    const lbl = ws($$(el).text());
    if (!lbl) return;

    const ul = $$(el).parent().nextAll("ul,ol").first();
    if (!ul.length) return;

    const category = normalizeAppearanceCategory(lbl);
    collectAppearanceListItems($$, ul, category);
  });

  // Fallback: any <li>
  if (out.length === 0) {
    const firstList = $$("ul, ol").first();
    if (firstList.length) {
      collectAppearanceListItems($$, firstList, { type: "OTHER" });
    }
  }

  return out;
}

/* =========================
 * Issue-level individuals
 * ========================= */

function parseIssueLevelIndividuals($: cheerio.CheerioAPI): CrawledIndividual[] {
  const out: CrawledIndividual[] = [];

  // "Art by: ..." line (body) exists on modern pages like Avengers (Vol 8 #9).
  const artByLine = $("*")
    .filter((_, el) => ws($(el).text()).startsWith("Art by:"))
    .first();

  if (artByLine.length) {
    const linkNames = collectNormalizedEntityNamesFromLinks($, artByLine);
    for (const name of linkNames) addUniqueIndividual(out, name, "coverArtist");
  }

  // Editor-in-Chief (H3 block) appears on many modern pages.
  for (const name of h3BlockLinksText($, "Editor-in-Chief"))
    addUniqueIndividual(out, name, "editorInChief");

  return out;
}

/* =======================
 * Arcs from "Part of ..."
 * ======================= */

function parseArcsFromPartOf($: cheerio.CheerioAPI): CrawledArc[] {
  const candidates = infoboxRows($)
    .map((el) => {
      const label = normalizeHeader($(el).find(".pi-data-label").text());
      const value = ws($(el).find(".pi-data-value").text());
      const valueNode = $(el).find(".pi-data-value").first();
      return { label, value, valueNode };
    })
    .filter(({ label, value }) => label === "part of" || /^part of the\b/i.test(value))
    .filter(({ value }) => /part of the/i.test(value) && value.length <= 320);

  const arcs: CrawledArc[] = [];
  const stripTrailingArcMetadata = (value: string): string => {
    let cleaned = value;

    while (true) {
      const match = cleaned.match(/\s+\(([^()]+)\)\s*$/);
      if (!match) break;

      const meta = normalizeHeader(match[1]);
      const hasArcMeta =
        /\bstory\s*arc\b/i.test(meta) ||
        /\bstoryline\b/i.test(meta) ||
        /\bevent\b/i.test(meta) ||
        /^arc$/i.test(meta);
      if (!hasArcMeta) break;

      cleaned = ws(cleaned.slice(0, cleaned.length - match[0].length));
    }

    return cleaned;
  };

  const addArc = (titleRaw: string, typeRaw?: string) => {
    const title = normalizeCrawlerEntityValue(
      titleRaw
        .replace(/^Part of the\s+/i, "")
        .replace(/\band\s*$/i, "")
        .replace(/\.$/, "")
        .replace(/\s+\((19|20)\d{2}\)\s*$/i, "")
        .replace(/\s+\((event|storyline|arc)\)\s*$/i, "")
        .replace(/^["“]|["”]$/g, ""),
    );
    const normalizedTitle = stripTrailingArcMetadata(title);
    if (!normalizedTitle) return;
    if (/\bseries$/i.test(normalizedTitle)) return;
    if (arcs.some((arc) => normalizeLower(arc.title) === normalizeLower(normalizedTitle))) return;

    const normalizedType = normalizeHeader(typeRaw || "");
    const type = /\bevents?\b/i.test(normalizedType) ? "EVENT" : "STORYARC";

    arcs.push({ title: normalizedTitle, type });
  };

  for (const candidate of candidates) {
    const html = candidate.valueNode.html() || "";
    if (!html) continue;

    const segments = html
      .split(/<br\s*\/?>/i)
      .map((segment) => ws(segment))
      .filter(Boolean);
    if (segments.length === 0) continue;

    for (const segment of segments) {
      const $$ = cheerio.load(`<root>${segment}</root>`);
      const root = $$("root");
      const segmentText = ws(root.text());
      if (!/part of the/i.test(segmentText)) continue;

      const segmentTypeMatch = segmentText.match(/\b(event|events|arc|arcs|storyline|storylines)\b/i);
      const segmentType = segmentTypeMatch ? segmentTypeMatch[1] : "";
      const linkedArcs = collectNormalizedEntityNamesFromLinks($$, root);

      for (const arcTitle of linkedArcs) {
        addArc(arcTitle, segmentType);
      }
    }
  }

  return arcs;
}

/* ====================
 * Variants / alt covers
 * ==================== */

async function getImageOriginalUrls(fileTitles: string[]): Promise<Map<string, string>> {
  const uniqueTitles = Array.from(new Set(fileTitles.filter(Boolean)));
  if (uniqueTitles.length === 0) return new Map();

  const data = await apiGet({
    action: "query",
    prop: "imageinfo",
    titles: uniqueTitles.join("|"),
    iiprop: "url",
  });

  const pages = data?.query?.pages || [];
  const result = new Map<string, string>();
  for (const page of pages) {
    const title = ws(page?.title || "");
    const url = normalizeImageUrl(page?.imageinfo?.[0]?.url);
    if (!title || !url) continue;

    const normalizedTitle = title.replace(/_/g, " ");
    result.set(title, String(url));
    result.set(normalizedTitle, String(url));
    result.set(normalizedTitle.replace(/ /g, "_"), String(url));
  }
  return result;
}

async function getIssueCategoryImageFileTitles(pageTitle: string): Promise<string[]> {
  const data = await apiGet({
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:${pageTitle}/Images`,
    cmtype: "file",
    cmlimit: "max",
  });

  const members = data?.query?.categorymembers || [];
  return Array.from(
    new Set(
      members
        .map((member: { title?: unknown }) => ws(String(member?.title || "")))
        .filter((title: string) => title.startsWith("File:")),
    ),
  );
}

function buildVariantLabelFromFileTitle(pageTitle: string, fileTitle: string): string {
  const normalizedTitle = ws(fileTitle).replace(/^File:/i, "");
  const withoutExtension = normalizedTitle.replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, "");
  const suffix = ws(withoutExtension.replace(new RegExp(`^${escapeRegExp(pageTitle)}`), ""));
  return suffix.replace(/^[-_ ]+/, "");
}

function normalizeImageUrl(raw: unknown): string {
  return ws(String(raw || ""))
    .replace(/\/revision\/latest(?:\/scale-to-width-down\/\d+)?(?:\?cb=[^#]+)?$/i, "")
    .replace(/\?cb=[^#]+$/i, "");
}

function normalizeFileTitleKey(value: string): string {
  return normalizeLower(ws(value || "").replace(/^File:/i, ""));
}

async function parseAlternateCoversFromImageCategory(
  pageTitle: string,
  base: {
    seriesTitle: string;
    seriesVolume: number;
    issueNumber: string;
    legacyNumber?: string;
    releasedate: string;
    price: number;
    currency: string;
    issueIndividuals: CrawledIndividual[];
  },
): Promise<CrawledIssue[]> {
  const fileTitles = await getIssueCategoryImageFileTitles(pageTitle);
  if (fileTitles.length === 0) return [];

  const coverFileTitles = fileTitles.filter((fileTitle) => {
    const normalized = ws(fileTitle).replace(/^File:/i, "");
    if (/ from /i.test(normalized)) return false;
    return normalizeLower(normalized).startsWith(normalizeLower(pageTitle));
  });

  const variantFileTitles = coverFileTitles.filter((fileTitle) => {
    const label = cleanVariantLabel(buildVariantLabelFromFileTitle(pageTitle, fileTitle).replace(/_/g, " "));
    return label.length > 0 && !shouldExcludeVariant(fileTitle, label);
  });

  if (variantFileTitles.length === 0) return [];

  const imageUrlMap = await getImageOriginalUrls(variantFileTitles);
  const variants: CrawledIssue[] = [];

  for (const fileTitle of variantFileTitles) {
    const originalUrl = imageUrlMap.get(fileTitle);
    if (!originalUrl) continue;
    const variant = cleanVariantLabel(buildVariantLabelFromFileTitle(pageTitle, fileTitle).replace(/_/g, " "));
    if (!variant) continue;

    variants.push({
      number: base.issueNumber,
      legacyNumber: base.legacyNumber,
      variant,
      releasedate: formatReleaseDate(base.releasedate),
      price: base.price,
      currency: base.currency,
      series: {
        title: base.seriesTitle,
        volume: base.seriesVolume,
      },
      cover: { number: variants.length + 1, url: originalUrl, individuals: [] },
      stories: [],
      individuals: [...base.issueIndividuals],
      arcs: [],
      variants: [],
    });
  }

  return variants;
}

function getSeriesCacheKey(title: string, volume: number): string {
  return `${normalizeLower(title)}::${volume}`;
}

function collectNodesUntilNextH2(startH2: Element): AnyNode[] {
  const nodes: AnyNode[] = [];
  let cur = (startH2 as any).nextSibling;
  while (cur) {
    if ((cur as any).name === "h2") break;
    nodes.push(cur as any);
    cur = (cur as any).nextSibling;
  }
  return nodes;
}

function getFileTitleFromLink($: cheerio.CheerioAPI, link: cheerio.Cheerio<any>): string {
  const href = normalizeWikiHref(link.attr("href")).replace(/^\/wiki\//, "");
  if (/^File:/i.test(href)) return href;
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(href)) return `File:${href.replace(/^File:/i, "")}`;

  const image = link.find("img").first();
  const imageName = ws(
    String(image.attr("data-image-name") || image.attr("data-image-key") || "").replace(/^File:/i, ""),
  );
  if (imageName) return `File:${imageName}`;

  const linkText = ws(link.text());
  if (/^Image:/i.test(linkText)) return linkText.replace(/^Image:/i, "File:");

  return "";
}

function parseContainedIssuesFromGallery($: cheerio.CheerioAPI): CrawledIssueReference[] {
  const gallery = $("#gallery-1");
  if (!gallery.length) return [];

  const containedIssues: CrawledIssueReference[] = [];
  const seen = new Set<string>();

  gallery.find(".wikia-gallery-item").each((_, galleryItem) => {
    const links = $(galleryItem).find("a[href^='/wiki/']").toArray();
    const parsedIssue = links
      .map((link) => {
        const href = normalizeWikiHref($(link).attr("href"));
        if (!href.startsWith("/wiki/")) return null;
        const pageTitle = decodeURIComponent(href.replace(/^\/wiki\//, "").split("#")[0].split("?")[0]);
        if (/^File:/i.test(pageTitle)) return null;
        return parseIssuePageTitle(pageTitle);
      })
      .find((candidate) => candidate && candidate.volume > 0 && candidate.issueNumber);

    if (!parsedIssue) return;

    const caption = $(galleryItem)
      .find(".lightbox-caption, .thumbcaption, .gallerytext, .wikia-gallery-caption")
      .first();
    const storyTitle = extractContainedIssueStoryTitleFromCaption($, caption);

    const normalizedReference = {
      number: parsedIssue.issueNumber,
      storyTitle,
      series: {
        title: canonicalSeriesTitle(parsedIssue.seriesTitle),
        volume: parsedIssue.volume,
      },
    };
    const key = `${normalizeLower(normalizedReference.series.title)}::${normalizedReference.series.volume}::${normalizeIssueNumberKey(normalizedReference.number)}`;
    if (seen.has(key)) return;
    seen.add(key);
    containedIssues.push(normalizedReference);
  });

  return containedIssues;
}


function isExcludedVariantValue(value: string): boolean {
  const normalized = normalizeLower(value).replace(/[_-]+/g, " ");
  if (/\btextless\b/.test(normalized) || /\bvirgin\b/.test(normalized) || /\bvirigin\b/.test(normalized)) {
    return true;
  }
  const compact = normalized.replace(/[^a-z0-9]+/g, "");
  return compact.includes("textless") || compact.includes("virgin") || compact.includes("virigin");
}

function shouldExcludeVariant(fileTitle: string, variantLabel: string): boolean {
  return isExcludedVariantValue(fileTitle) || isExcludedVariantValue(variantLabel);
}

function extractArtistsFromText(raw: string): string[] {
  const match = ws(raw).match(/art by:\s*([^\n]+)/i);
  if (!match) return [];
  return splitListNames(match[1]).filter((name) => !isPlaceholderArtistName(name));
}

function cleanVariantLabel(raw: string): string {
  const value = ws(String(raw || "").replace(/^\d+\s*-\s*/i, ""));
  if (!value) return "";
  return ws(
    value
      .replace(/\s*\(?art by:\s*.*$/i, "")
      .replace(/\s+variant\b$/i, ""),
  );
}

function isPlaceholderArtistName(value: string): boolean {
  const normalized = normalizeLower(value);
  return (
    normalized === "" ||
    normalized === "uncredited" ||
    normalized === "not yet listed" ||
    normalized === "cover artist credit needed"
  );
}

function extractArtistsFromVariantTabContent(
  $: cheerio.CheerioAPI,
  content: cheerio.Cheerio<AnyNode>,
): string[] {
  const linkedArtists = collectNormalizedEntityNamesFromLinks($, content.find("figcaption, .pi-caption")).filter(
    (name) => !isPlaceholderArtistName(name),
  );
  if (linkedArtists.length > 0) return linkedArtists;
  return [];
}

function extractVariantEntriesFromWdsTabber(
  $: cheerio.CheerioAPI,
): Array<{ fileTitle: string; artists: string[]; variant: string }> {
  const tabber = $("section.wds-tabber, .wds-tabber")
    .filter((_, el) => $(el).find(".pi-item .pi-image").length > 0)
    .first();

  if (!tabber.length) return [];

  const tabContents = tabber.find(".wds-tab__content").toArray();
  if (tabContents.length === 0) return [];

  const galleryIndex = tabContents.findIndex((content) => $(content).find(".wikia-gallery-item").length > 0);
  if (galleryIndex < 0) return [];

  const labelsByFileTitle = new Map<string, string>();
  $(tabContents[galleryIndex])
    .find(".wikia-gallery-item")
    .each((_, galleryItem) => {
      const item = $(galleryItem);
      const image = item.find("img[data-image-name], img").first();
      const imageName = ws(
        String(image.attr("data-image-name") || image.attr("data-image-key") || "").replace(/^File:/i, ""),
      );
      const fileLink = item.find("a").first();
      const fileTitle = imageName ? `File:${imageName}` : getFileTitleFromLink($, fileLink);
      if (!fileTitle) return;

      const variant = cleanVariantLabel(
        item.find(".lightbox-caption").first().text() ||
          image.attr("data-caption") ||
          image.attr("alt") ||
          fileLink.attr("title") ||
          "",
      );
      if (!variant || normalizeLower(variant) === "all") return;
      labelsByFileTitle.set(normalizeFileTitleKey(fileTitle), variant);
    });

  const entriesWithArtists = tabContents
    .slice(galleryIndex + 1)
    .map((content) => {
      const figure = $(content).find("figure.pi-image, .pi-item.pi-image").first();
      const fileLink = figure.find("a").first();
      const image = figure.find("img").first();
      const imageName = ws(
        String(image.attr("data-image-name") || image.attr("data-image-key") || "").replace(/^File:/i, ""),
      );
      const fileTitle = imageName ? `File:${imageName}` : getFileTitleFromLink($, fileLink);
      const variant = cleanVariantLabel(
        labelsByFileTitle.get(normalizeFileTitleKey(fileTitle)) ||
          image.attr("alt") ||
          fileLink.attr("title") ||
          "",
      );
      const artists = extractArtistsFromVariantTabContent($, $(content));
      return {
        fileTitle,
        variant,
        artists,
      };
    })
    .filter((entry) => entry.fileTitle && entry.variant && normalizeLower(entry.variant) !== "all");

  const seen = new Set<string>();
  return entriesWithArtists.filter((entry) => {
    if (shouldExcludeVariant(entry.fileTitle, entry.variant)) return false;
    const key = `${normalizeFileTitleKey(entry.fileTitle)}::${normalizeLower(entry.variant)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function buildVariantIssuesFromEntries(
  entries: Array<{ fileTitle: string; artists: string[]; variant: string }>,
  base: {
    seriesTitle: string;
    seriesVolume: number;
    issueNumber: string;
    legacyNumber?: string;
    releasedate: string;
    price: number;
    currency: string;
    issueIndividuals: CrawledIndividual[];
  },
): Promise<CrawledIssue[]> {
  const variants: CrawledIssue[] = [];
  const imageUrlMap = await getImageOriginalUrls(entries.map((entry) => entry.fileTitle));

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    const originalUrl = imageUrlMap.get(entry.fileTitle);
    if (!originalUrl) continue;

    const coverIndividuals: CrawledIndividual[] = [];
    for (const artist of entry.artists) addUniqueIndividual(coverIndividuals, artist, "coverArtist");

    variants.push({
      number: base.issueNumber,
      legacyNumber: base.legacyNumber,
      variant: entry.variant,
      releasedate: formatReleaseDate(base.releasedate),
      price: base.price,
      currency: base.currency,
      series: {
        title: base.seriesTitle,
        volume: base.seriesVolume,
      },
      cover: { number: idx + 1, url: originalUrl, individuals: coverIndividuals },
      stories: [],
      individuals: [...base.issueIndividuals],
      arcs: [],
      variants: [],
    });
  }

  return variants;
}

async function parseAlternateCoversAsVariantIssues(
  $: cheerio.CheerioAPI,
  pageTitle: string,
  base: {
    seriesTitle: string;
    seriesVolume: number;
    issueNumber: string;
    legacyNumber?: string;
    releasedate: string;
    price: number;
    currency: string;
    issueIndividuals: CrawledIndividual[];
  }
): Promise<CrawledIssue[]> {
  const entries = extractVariantEntriesFromWdsTabber($);
  if (entries.length === 0) return parseAlternateCoversFromImageCategory(pageTitle, base);
  return buildVariantIssuesFromEntries(entries, base);
}

/* ==================
 * Public: crawlSeries
 * ================== */

export async function crawlSeries(title: string, volume: number): Promise<CrawledSeries> {
  const cacheKey = getSeriesCacheKey(title, volume);
  const cached = seriesCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async (): Promise<CrawledSeries> => {
    const seriesPageTitle = buildSeriesPageTitle(title, volume);
    const $ = await parsePageHtmlByTitle(seriesPageTitle);

    const publisher =
      h3BlockValueText($, "Publisher") ??
      infoboxValueText($, "Publisher") ??
      inlineLabelValueText($, "Publisher") ??
      "";

    const publicationDate =
      h3BlockValueText($, "Publication Date") ??
      infoboxValueText($, "Publication Date") ??
      inlineLabelValueText($, "Publication Date");
    const genre =
      h3BlockValueText($, "Genre") ??
      infoboxValueText($, "Genre") ??
      inlineLabelValueText($, "Genre") ??
      "";

    const { startyear, endyear } = parseYearRange(publicationDate);

    return {
      title,
      volume,
      startyear,
      endyear,
      publisherName: publisher,
      genre,
    };
  })();

  seriesCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    seriesCache.delete(cacheKey);
    throw error;
  }
}

/* =================
 * Public: crawlIssue
 * ================= */

export async function crawlIssue(
  seriesTitle: string,
  volume: number,
  number: string,
  options?: CrawlIssueOptions,
): Promise<CrawledIssue> {
  const issuePageTitle = buildIssuePageTitle(seriesTitle, volume, number);
  const issuePageResolution = await resolvePageTitle(issuePageTitle, options?.pageTitleResolution);
  const $ = await parsePageHtmlByTitle(issuePageTitle, issuePageResolution);
  const collectedIssues = parseContainedIssuesFromGallery($);

  const releasedate =
    h3BlockValueText($, "Release Date") ??
    infoboxValueText($, "Release Date") ??
    h3BlockValueText($, "Cover Date") ??
    infoboxValueText($, "Cover Date") ??
    "";
  const legacyNumber = parseLegacyNumber($) ?? undefined;

  const rawPrice =
    h3BlockValueText($, "Original Price") ??
    h3BlockValueText($, "Price") ??
    infoboxValueText($, "Original Price") ??
    infoboxValueText($, "Price");

  const { price, currency } = parsePrice(rawPrice);

  const coverFileTitle = infoboxTopImageFileTitle($);
  const coverUrlMap = coverFileTitle ? await getImageOriginalUrls([coverFileTitle]) : new Map<string, string>();
  const coverUrl =
    (coverFileTitle ? coverUrlMap.get(coverFileTitle) : null) ??
    infoboxTopImageUrl($) ??
    "";

  let seriesMeta: CrawledSeries | null = null;
  try {
    seriesMeta = await crawlSeries(seriesTitle, volume);
  } catch {
    seriesMeta = null;
  }

  const individuals = parseIssueLevelIndividuals($);
  const issueIndividuals = individuals.filter((individual) => individual.type !== "ARTIST");
  const arcs = parseArcsFromPartOf($);

  const storyKeys = findStories($);
  const stories: CrawledStory[] = storyKeys.map((sk) => {
    const nodes = nextUntilH2Nodes(sk.h2El);
    const fragment = nodes.map((n) => $.html(n)).join("");

    const storyIndividuals = parseStoryIndividualsFromBlock(fragment);
    const reprintOf = parseStoryReprintOfFromBlock(fragment);
    const appearances = parseAppearancesForStory($, sk);

    return {
      number: sk.number,
      title: sk.title,
      reprintOf,
      individuals: reprintOf ? [] : storyIndividuals,
      appearances: reprintOf ? [] : appearances,
    };
  });

  const variantIssues = await parseAlternateCoversAsVariantIssues($, issuePageResolution.resolvedPageTitle, {
    seriesTitle,
    seriesVolume: volume,
    issueNumber: number,
    legacyNumber,
    releasedate,
    price,
    currency,
    issueIndividuals,
  });

  const cover: CrawledCover = {
    number: 1,
    url: coverUrl,
    individuals: individuals.filter((i) => i.type === "ARTIST"),
  };

  return {
    number,
    legacyNumber,
    releasedate: formatReleaseDate(releasedate),
    price,
    currency,
    series: {
      title: seriesMeta?.title ?? seriesTitle,
      volume: seriesMeta?.volume ?? volume,
      startyear: seriesMeta?.startyear,
      endyear: seriesMeta?.endyear,
      genre: seriesMeta?.genre,
      publisher: seriesMeta?.publisherName
        ? { name: seriesMeta.publisherName }
        : undefined,
    },
    cover,
    stories,
    variants: variantIssues,
    individuals: issueIndividuals,
    arcs,
    collectedIssues,
    containedIssues: collectedIssues,
  };
}

export class MarvelCrawlerService {
  async crawlSeries(title: string, volume: number): Promise<CrawledSeries> {
    return crawlSeries(title, volume);
  }

  async crawlIssue(title: string, volume: number, number: string, options?: CrawlIssueOptions): Promise<CrawledIssue> {
    return crawlIssue(title, volume, number, options);
  }
}

export const __testables = {
  extractContainedIssueStoryTitleFromCaption,
};
