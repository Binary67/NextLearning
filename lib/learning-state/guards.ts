export function hasExactKeys(
  value: Record<string, unknown>,
  keys: string[],
) {
  const actualKeys = Object.keys(value);

  return (
    actualKeys.length === keys.length &&
    keys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
}

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0
  );
}

export function isNonNegativeInteger(
  value: unknown,
): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 0
  );
}

export function isUniqueStringArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    value.every(
      (item) => typeof item === "string" && item.length > 0,
    ) &&
    new Set(value).size === value.length
  );
}

export function isLearningConfidence(
  value: unknown,
): value is 1 | 2 | 3 | null {
  return value === null || value === 1 || value === 2 || value === 3;
}

export function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.includes("T") &&
    !Number.isNaN(Date.parse(value))
  );
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
