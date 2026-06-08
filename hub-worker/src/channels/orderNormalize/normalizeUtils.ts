export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function text(record: Record<string, unknown>, field: string): string | null {
  return toStringValue(record[field]);
}

export function nestedRecord(record: Record<string, unknown>, field: string): Record<string, unknown> | null {
  const value = record[field];
  return isRecord(value) ? value : null;
}

export function toStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function firstNonBlank(...values: Array<string | null | undefined>): string | null {
  return values.find((value) => value !== null && value !== undefined && value.trim() !== "") ?? null;
}

export function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function numberValue(record: Record<string, unknown>, ...fields: string[]): number | null {
  const value = firstNonBlank(...fields.map((field) => text(record, field)));
  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function integerValue(record: Record<string, unknown>, ...fields: string[]): number | null {
  const value = numberValue(record, ...fields);
  return value === null ? null : Math.trunc(value);
}

export function itemRecords(order: Record<string, unknown>, ...fields: string[]): Record<string, unknown>[] {
  for (const field of fields) {
    const value = order[field];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }
  return [order];
}

export function firstNestedText(
  order: Record<string, unknown>,
  pathCandidates: Array<[string, string]>
): string | null {
  for (const [objectField, valueField] of pathCandidates) {
    const object = nestedRecord(order, objectField);
    if (!object) {
      continue;
    }
    const value = text(object, valueField);
    if (value) {
      return value;
    }
  }
  return null;
}
