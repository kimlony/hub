export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function text(record: Record<string, unknown>, ...fields: string[]): string | null {
  for (const field of fields) {
    const value = record[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

export function compactDate(value: unknown, fieldName: string): string {
  const parsed = requireString(value, fieldName);
  if (!/^\d{8}$/.test(parsed)) {
    throw new Error(`${fieldName} must be yyyyMMdd`);
  }
  return parsed;
}

export function targetOrderIds(targets: Array<{ channelOrderId: string }>): Set<string> {
  return new Set(targets.map((target) => target.channelOrderId));
}

