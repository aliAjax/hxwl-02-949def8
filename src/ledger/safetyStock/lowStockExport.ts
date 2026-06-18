import type { LowStockHerbItem } from "../types";

export function exportLowStockListCsv(items: LowStockHerbItem[]): string {
  const headers = [
    "饮片名称",
    "分类",
    "当前库存(g)",
    "安全库存(g)",
    "缺口(g)",
    "涉及批号",
    "产地",
  ];

  const rows = items.map((item) => {
    const batchNos = item.batches.map((b) => b.batchNo).join("、");
    const origins = Array.from(new Set(item.batches.map((b) => b.origin))).join("、");
    return [
      item.name,
      item.category,
      String(item.totalStock),
      String(item.thresholdGrams),
      String(item.shortageGrams),
      batchNos,
      origins,
    ];
  });

  const formatCell = (cell: string): string =>
    `"${cell.replace(/"/g, '""')}"`;

  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(formatCell).join(",")).join("\n")
  );
}
