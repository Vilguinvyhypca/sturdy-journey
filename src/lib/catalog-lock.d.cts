export function withCatalogLock<T>(directory: string, operation: () => Promise<T>, timeoutSeconds?: number): Promise<T>;
