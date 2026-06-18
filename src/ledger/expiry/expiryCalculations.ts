import { NEAR_EXPIRY_DAYS, WARNING_EXPIRY_DAYS_30 } from "../types";
import type { ExpiryStatus, AlertLevel } from "../types";

export function daysUntilExpiry(expiry: string, referenceDate?: Date): number {
  const today = referenceDate ? new Date(referenceDate) : new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(expiry);
  return Math.ceil(
    (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function selectExpiryStatus(
  expiry: string,
  options?: { nearExpiryDays?: number; referenceDate?: Date }
): ExpiryStatus {
  const nearExpiryDays = options?.nearExpiryDays ?? NEAR_EXPIRY_DAYS;
  const diff = daysUntilExpiry(expiry, options?.referenceDate);
  if (diff <= 0) return "expired";
  if (diff <= nearExpiryDays) return "near";
  return "ok";
}

export function selectAlertLevel(
  expiry: string,
  options?: { referenceDate?: Date }
): AlertLevel {
  const diff = daysUntilExpiry(expiry, options?.referenceDate);
  if (diff <= 0) return "expired";
  if (diff <= WARNING_EXPIRY_DAYS_30) return "warning30";
  if (diff <= NEAR_EXPIRY_DAYS) return "warning60";
  return "normal";
}

export function selectExpiringBatches(
  batches: Array<{ id: string; expiry: string }>,
  options?: { nearExpiryDays?: number; referenceDate?: Date }
): string[] {
  const nearExpiryDays = options?.nearExpiryDays ?? NEAR_EXPIRY_DAYS;
  return batches
    .filter((b) => {
      const status = selectExpiryStatus(b.expiry, { nearExpiryDays, referenceDate: options?.referenceDate });
      return status === "near" || status === "expired";
    })
    .map((b) => b.id);
}
