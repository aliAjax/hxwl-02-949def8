import type { LedgerState, BatchLedgerDTO } from "../types";
import { selectCurrentStock } from "./stockSelectors";

export function selectAllBatches(state: LedgerState): BatchLedgerDTO[] {
  return Object.values(state.batches)
    .filter((b) => !b.isDeleted)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function selectBatches(state: LedgerState): BatchLedgerDTO[] {
  return selectAllBatches(state);
}

export function selectBatchById(
  state: LedgerState,
  batchId: string
): BatchLedgerDTO | undefined {
  const batch = state.batches[batchId];
  return batch && !batch.isDeleted ? batch : undefined;
}

export function selectBatchByNo(
  state: LedgerState,
  batchNo: string
): BatchLedgerDTO | undefined {
  return Object.values(state.batches).find(
    (b) => !b.isDeleted && b.batchNo === batchNo
  );
}

export function selectBatchesByHerbName(
  state: LedgerState,
  name: string
): BatchLedgerDTO[] {
  return selectAllBatches(state).filter(
    (b) => b.name.toLowerCase() === name.toLowerCase()
  );
}

export function checkBatchNoExists(
  state: LedgerState,
  batchNo: string,
  excludeId?: string
): boolean {
  return Object.values(state.batches).some(
    (b) => !b.isDeleted && b.batchNo === batchNo && b.id !== excludeId
  );
}

export function selectTotalStockByName(
  state: LedgerState
): Array<{ name: string; totalStock: number; unit: string; batchCount: number }> {
  const map = new Map<string, { total: number; unit: string; count: number }>();
  for (const batch of selectAllBatches(state)) {
    const stock = selectCurrentStock(state, batch.id);
    const existing = map.get(batch.name) ?? {
      total: 0,
      unit: batch.unit,
      count: 0,
    };
    existing.total += stock;
    existing.count += 1;
    map.set(batch.name, existing);
  }
  return Array.from(map.entries()).map(([name, data]) => ({
    name,
    totalStock: data.total,
    unit: data.unit,
    batchCount: data.count,
  }));
}

export function selectHerbAggregatedStockMap(
  ledgerState: LedgerState
): Map<string, {
  name: string;
  category: string;
  unit: string;
  totalStock: number;
  batches: BatchLedgerDTO[];
}> {
  const map = new Map<string, {
    name: string;
    category: string;
    unit: string;
    totalStock: number;
    batches: BatchLedgerDTO[];
  }>();

  for (const batch of selectAllBatches(ledgerState)) {
    const stock = selectCurrentStock(ledgerState, batch.id);
    const existing = map.get(batch.name);
    if (existing) {
      existing.totalStock += stock;
      existing.batches.push(batch);
    } else {
      map.set(batch.name, {
        name: batch.name,
        category: batch.category,
        unit: batch.unit,
        totalStock: stock,
        batches: [batch],
      });
    }
  }
  return map;
}

export function selectLowStockBatches(
  state: LedgerState,
  threshold: number
): BatchLedgerDTO[] {
  return selectAllBatches(state).filter((b) =>
    selectCurrentStock(state, b.id) < threshold
  );
}
