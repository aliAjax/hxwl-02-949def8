import type { LedgerState, LedgerOperationDTO } from "../types";

export function selectAllOperations(state: LedgerState): LedgerOperationDTO[] {
  return state.operations.filter((o) => !o.isDeleted);
}

export function selectOperationsByBatchId(
  state: LedgerState,
  batchId: string
): LedgerOperationDTO[] {
  return state.operations.filter(
    (o) => !o.isDeleted && o.batchId === batchId
  );
}

export function selectOperationsForBatch(
  state: LedgerState,
  batchId: string
): LedgerOperationDTO[] {
  return state.operations.filter(
    (op) => !op.isDeleted && op.batchId === batchId
  );
}

export function selectRecentOperations(
  state: LedgerState,
  batchId: string,
  limit = 5
): LedgerOperationDTO[] {
  return selectOperationsForBatch(state, batchId).slice(0, limit);
}

export function selectCurrentStock(
  state: LedgerState,
  batchId: string
): number {
  let stock = 0;
  for (const op of state.operations) {
    if (op.isDeleted || op.batchId !== batchId) continue;
    stock += op.type === "inbound" ? op.quantity : -op.quantity;
  }
  return stock;
}

export function isLowStock(stock: number, threshold: number): boolean {
  return stock < threshold;
}
