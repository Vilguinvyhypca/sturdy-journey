export type OperationAction = "media.create" | "media.update" | "media.delete" | "profile.create" | "profile.update" | "theme.update" | "upload.playback" | "upload.thumbnail" | "upload.cleanup" | "upload.save" | "media.original" | "media.playback" | "media.thumbnail" | "experience.store" | "request.error";
export type OperationDetails = { id?: string; fields?: string[]; beforeVisibility?: string; visibility?: string; route?: string; method?: string };
export function recordOperation(dataDirectory: string, action: OperationAction, details?: OperationDetails, error?: unknown): Promise<void>;
export function recordFailure(action: OperationAction, error: unknown, details?: OperationDetails): Promise<void>;
export const maximumDailyBytes: number;
export const retentionDays: number;
