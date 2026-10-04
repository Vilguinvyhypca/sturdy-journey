import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

export const experienceEventNames = [
  "page_view", "page_load", "page_exit", "media_open", "video_start", "video_complete", "video_error",
  "search", "filter", "load_more", "outbound_click", "share_link", "client_error",
] as const;

export type ExperienceEventName = (typeof experienceEventNames)[number];
export type ExperienceEvent = {
  id: string;
  sessionId: string;
  name: ExperienceEventName;
  path: string;
  at: string;
  source?: string;
  campaign?: string;
  referrerHost?: string;
  destinationHost?: string;
  mediaType?: "photo" | "video";
  mediaId?: string;
  filter?: string;
  resultCount?: number;
  queryLength?: number;
  durationMs?: number;
  loadMs?: number;
  errorType?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pathPattern = /^\/(?!\/)[^?#\s]*$/;
const eventNameSet = new Set<string>(experienceEventNames);
const maximumDurationMs = 24 * 60 * 60 * 1000;

function shortText(value: unknown, maximum: number) {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/[\r\n\t]/g, " ").slice(0, maximum);
  return clean || undefined;
}

function boundedInteger(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum ? value : undefined;
}

export function validateExperienceEvent(input: unknown): Omit<ExperienceEvent, "id" | "at"> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const event = input as Record<string, unknown>;
  if (typeof event.sessionId !== "string" || !uuidPattern.test(event.sessionId)) return null;
  if (typeof event.name !== "string" || !eventNameSet.has(event.name)) return null;
  if (typeof event.path !== "string" || event.path.length > 300 || !pathPattern.test(event.path)) return null;

  const output: Omit<ExperienceEvent, "id" | "at"> = {
    sessionId: event.sessionId,
    name: event.name as ExperienceEventName,
    path: event.path,
  };
  const source = shortText(event.source, 100);
  const campaign = shortText(event.campaign, 100);
  const referrerHost = shortText(event.referrerHost, 253);
  const destinationHost = shortText(event.destinationHost, 253);
  const mediaId = shortText(event.mediaId, 128);
  const filter = shortText(event.filter, 32);
  const errorType = shortText(event.errorType, 64)?.replace(/[^A-Za-z0-9_.-]/g, "");
  const mediaType = event.mediaType === "photo" || event.mediaType === "video" ? event.mediaType : undefined;
  const resultCount = boundedInteger(event.resultCount, 100_000);
  const queryLength = boundedInteger(event.queryLength, 200);
  const durationMs = boundedInteger(event.durationMs, maximumDurationMs);
  const loadMs = boundedInteger(event.loadMs, 120_000);
  if (source) output.source = source;
  if (campaign) output.campaign = campaign;
  if (referrerHost) output.referrerHost = referrerHost;
  if (destinationHost) output.destinationHost = destinationHost;
  if (mediaType) output.mediaType = mediaType;
  if (mediaId) output.mediaId = mediaId;
  if (filter) output.filter = filter;
  if (resultCount !== undefined) output.resultCount = resultCount;
  if (queryLength !== undefined) output.queryLength = queryLength;
  if (durationMs !== undefined) output.durationMs = durationMs;
  if (loadMs !== undefined) output.loadMs = loadMs;
  if (errorType) output.errorType = errorType;
  return output;
}

function experienceDirectory() {
  const dataDirectory = process.env.MEDIA_DATA_DIR ? join(process.env.MEDIA_DATA_DIR) : join(process.cwd(), "data");
  return join(dataDirectory, "experience");
}

let pendingWrite: Promise<unknown> = Promise.resolve();
let lastCleanupDate = "";
export function recordExperienceEvent(event: Omit<ExperienceEvent, "id" | "at">) {
  const operation = pendingWrite.then(async () => {
    const directory = experienceDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const date = new Date().toISOString().slice(0, 10);
    if (lastCleanupDate !== date) {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - 90);
      const cutoffDate = cutoff.toISOString().slice(0, 10);
      const oldFiles = await readdir(directory);
      await Promise.all(oldFiles.filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file) && file.slice(0, 10) < cutoffDate).map((file) => rm(join(directory, file), { force: true })));
      lastCleanupDate = date;
    }
    const path = join(directory, `${date}.jsonl`);
    const noFollowFlag = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
    const file = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | noFollowFlag, 0o600);
    try {
      await file.writeFile(`${JSON.stringify({ ...event, id: randomUUID(), at: new Date().toISOString() })}\n`, "utf8");
    } finally {
      await file.close();
    }
  });
  pendingWrite = operation.catch(() => undefined);
  return operation;
}

type Count = { label: string; count: number };
export type ExperienceSummary = {
  days: number;
  pageViews: number;
  sessions: number;
  errors: number;
  averageLoadMs: number | null;
  averageDurationMs: number | null;
  daily: { date: string; pageViews: number; sessions: number; errors: number }[];
  popularPages: Count[];
  sources: Count[];
  externalLinks: Count[];
  actions: Count[];
  behavior: Count[];
  commonJourneys: Count[];
};

export async function readExperienceSummary(days = 30): Promise<ExperienceSummary> {
  const safeDays = Math.min(Math.max(Math.trunc(days), 1), 90);
  const directory = experienceDirectory();
  const end = new Date();
  const dates = Array.from({ length: safeDays }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - (safeDays - 1 - index));
    return date.toISOString().slice(0, 10);
  });
  const pageCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const externalLinkCounts = new Map<string, number>();
  const actionCounts = new Map<string, number>();
  const sessionIds = new Set<string>();
  const eventsBySession = new Map<string, ExperienceEvent[]>();
  const sessionsByDate = new Map(dates.map((date) => [date, new Set<string>()]));
  const daily = new Map(dates.map((date) => [date, { date, pageViews: 0, sessions: 0, errors: 0 }]));
  let pageViews = 0;
  let errors = 0;
  let pageLoadTotal = 0;
  let pageLoadCount = 0;
  let pageDurationTotal = 0;
  let pageDurationCount = 0;
  let existingFiles: Set<string>;
  try {
    existingFiles = new Set(await readdir(directory));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { days: safeDays, pageViews: 0, sessions: 0, errors: 0, averageLoadMs: null, averageDurationMs: null, daily: dates.map((date) => ({ date, pageViews: 0, sessions: 0, errors: 0 })), popularPages: [], sources: [], externalLinks: [], actions: [], behavior: [], commonJourneys: [] };
    throw error;
  }
  for (const date of dates) {
    if (!existingFiles.has(`${date}.jsonl`)) continue;
    const text = await readFile(join(directory, `${date}.jsonl`), "utf8");
    for (const line of text.split("\n")) {
      if (!line) continue;
      let event: ExperienceEvent;
      try { event = JSON.parse(line) as ExperienceEvent; } catch { continue; }
      if (!event || !uuidPattern.test(event.sessionId) || !event.name || !daily.has(date)) continue;
      const day = daily.get(date)!;
      sessionIds.add(event.sessionId);
      sessionsByDate.get(date)!.add(event.sessionId);
      const sessionEvents = eventsBySession.get(event.sessionId) ?? [];
      sessionEvents.push(event);
      eventsBySession.set(event.sessionId, sessionEvents);
      actionCounts.set(event.name, (actionCounts.get(event.name) ?? 0) + 1);
      if (event.name === "page_view") {
        pageViews += 1;
        day.pageViews += 1;
        pageCounts.set(event.path, (pageCounts.get(event.path) ?? 0) + 1);
        const baseSource = event.source || event.referrerHost || "Direct / unknown";
        const source = event.campaign ? `${baseSource} · ${event.campaign}` : baseSource;
        sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
      }
      if (event.name === "page_load" && typeof event.loadMs === "number") { pageLoadTotal += event.loadMs; pageLoadCount += 1; }
      if (event.name === "outbound_click" && event.destinationHost) externalLinkCounts.set(event.destinationHost, (externalLinkCounts.get(event.destinationHost) ?? 0) + 1);
      if (event.name === "client_error" || event.name === "video_error") {
        errors += 1;
        day.errors += 1;
      }
      if (event.name === "page_exit" && typeof event.durationMs === "number" && event.durationMs >= 1_000) {
        pageDurationTotal += event.durationMs;
        pageDurationCount += 1;
      }
    }
  }
  for (const date of dates) daily.get(date)!.sessions = sessionsByDate.get(date)!.size;
  const behaviorCounts = new Map<string, number>();
  const journeyCounts = new Map<string, number>();
  const bump = (label: string, condition: boolean) => {
    if (condition) behaviorCounts.set(label, (behaviorCounts.get(label) ?? 0) + 1);
  };
  for (const sessionEvents of eventsBySession.values()) {
    sessionEvents.sort((first, second) => first.at.localeCompare(second.at));
    const profileViewed = sessionEvents.some((event) => event.name === "page_view" && event.path.startsWith("/p/"));
    const mediaOpened = sessionEvents.some((event) => event.name === "media_open");
    const videoOpened = sessionEvents.some((event) => (event.name === "media_open" && event.mediaType === "video") || (event.name === "page_view" && event.path.startsWith("/videos/")));
    const videoStarted = sessionEvents.some((event) => event.name === "video_start");
    const videoCompleted = sessionEvents.some((event) => event.name === "video_complete");
    bump("Visited a profile", profileViewed);
    bump("Profile visit without opening media", profileViewed && !mediaOpened);
    bump("Opened a video", videoOpened);
    bump("Opened a video but did not start playback", videoOpened && !videoStarted);
    bump("Started playback but did not finish", videoStarted && !videoCompleted);
    bump("Completed a video", videoCompleted);
    bump("Used search", sessionEvents.some((event) => event.name === "search"));
    bump("Shared a media link", sessionEvents.some((event) => event.name === "share_link"));

    const steps: string[] = [];
    for (const event of sessionEvents) {
      const step = event.name === "page_view" ? event.path
        : event.name === "media_open" ? `open ${event.mediaType ?? "media"}`
        : event.name === "video_start" ? "play video"
        : event.name === "video_complete" ? "finish video"
        : event.name === "search" ? "search"
        : event.name === "filter" ? `filter ${event.filter ?? "media"}`
        : event.name === "share_link" ? "share media"
        : event.name === "outbound_click" ? `visit ${event.destinationHost ?? "external site"}`
        : undefined;
      if (step && steps.at(-1) !== step && steps.length < 6) steps.push(step);
    }
    if (steps.length > 1) {
      const journey = steps.join(" → ");
      journeyCounts.set(journey, (journeyCounts.get(journey) ?? 0) + 1);
    }
  }
  return {
    days: safeDays,
    pageViews,
    sessions: sessionIds.size,
    errors,
    averageLoadMs: pageLoadCount ? Math.round(pageLoadTotal / pageLoadCount) : null,
    averageDurationMs: pageDurationCount ? Math.round(pageDurationTotal / pageDurationCount) : null,
    daily: dates.map((date) => daily.get(date)!),
    popularPages: [...pageCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    sources: [...sourceCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    externalLinks: [...externalLinkCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    actions: [...actionCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    behavior: [...behaviorCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    commonJourneys: [...journeyCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10),
  };
}
