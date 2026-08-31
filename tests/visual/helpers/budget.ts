import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * P3 · 交互延迟预算。
 *
 * 截图守外观，这一条守手感。预算数字第一轮由实测定基线（`W10.md` P3），
 * 之后**只减不增**——这条规则是本文件存在的全部理由。
 *
 * 为什么是 p95 而不是平均：平均会被一堆快样本稀释掉那几次卡顿，
 * 而用户记住的恰恰是卡顿的那几次。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BUDGET_FILE = resolve(HERE, "..", "budgets", "interaction-budget.json");

export interface BudgetEntry {
  /** p95 上限，毫秒。 */
  p95Ms: number;
  /** 定这条基线时的样本数。样本太少的基线不可信，读的人有权知道。 */
  samples: number;
  /** 定基线的日期与机器画像。换机器后偏差大属正常，见运行手册。 */
  recordedAt: string;
  note: string;
}

export type BudgetFile = Record<string, BudgetEntry>;

export function readBudgets(): BudgetFile {
  if (!existsSync(BUDGET_FILE)) return {};
  return JSON.parse(readFileSync(BUDGET_FILE, "utf8")) as BudgetFile;
}

function writeBudgets(budgets: BudgetFile): void {
  mkdirSync(dirname(BUDGET_FILE), { recursive: true });
  writeFileSync(BUDGET_FILE, `${JSON.stringify(budgets, null, 2)}\n`, "utf8");
}

/** 线性插值 p95。样本少时退化成最大值，这是保守的方向。 */
export function p95(samples: number[]): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length < 20) return sorted[sorted.length - 1];
  const rank = 0.95 * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return sorted[low] + (rank - low) * (sorted[high] - sorted[low]);
}

export interface BudgetVerdict {
  kind: "recorded" | "within" | "exceeded";
  measuredP95: number;
  budget: BudgetEntry | null;
  message: string;
}

/**
 * 判定一条交互。
 *
 * - 没有基线且开了 `LEO_BUDGET_UPDATE=1` ⇒ 记录（第一轮定基线）；
 * - 没有基线且没开 ⇒ 判红。**不许静默建基线**：那等于第一次跑什么数都算合格，
 *   闸在诞生当天就失去意义。
 * - 有基线 ⇒ 超了判红；没超则在 update 模式下**只往下收**，绝不上调。
 */
export function judge(
  name: string,
  samples: number[],
  note: string,
): BudgetVerdict {
  const measured = p95(samples);
  const budgets = readBudgets();
  const existing = budgets[name] ?? null;
  const updating = process.env.LEO_BUDGET_UPDATE === "1";

  if (!existing) {
    if (!updating) {
      return {
        kind: "exceeded",
        measuredP95: measured,
        budget: null,
        message:
          `交互 \`${name}\` 没有预算基线，实测 p95=${measured.toFixed(1)}ms。\n  ` +
          "第一轮定基线要显式跑 `npm run test:visual:update`（它会设 LEO_BUDGET_UPDATE=1）。\n  " +
          "不静默建基线是刻意的：那会让闸在诞生当天就恒绿。",
      };
    }
    const entry: BudgetEntry = {
      p95Ms: Math.ceil(measured),
      samples: samples.length,
      recordedAt: new Date().toISOString().slice(0, 10),
      note,
    };
    budgets[name] = entry;
    writeBudgets(budgets);
    return {
      kind: "recorded",
      measuredP95: measured,
      budget: entry,
      message: `已记录 \`${name}\` 的首轮基线 p95=${entry.p95Ms}ms（${entry.samples} 样本）。`,
    };
  }

  if (measured > existing.p95Ms) {
    return {
      kind: "exceeded",
      measuredP95: measured,
      budget: existing,
      message:
        `交互 \`${name}\` 超预算：实测 p95=${measured.toFixed(1)}ms > 预算 ${existing.p95Ms}ms\n  ` +
        `（基线记于 ${existing.recordedAt}，${existing.samples} 样本：${existing.note}）\n  ` +
        "预算只减不增。要放宽必须先说明为什么这个交互本来就该更慢，并在交付说明里留档。",
    };
  }

  if (updating && Math.ceil(measured) < existing.p95Ms) {
    budgets[name] = {
      ...existing,
      p95Ms: Math.ceil(measured),
      samples: samples.length,
      recordedAt: new Date().toISOString().slice(0, 10),
      note,
    };
    writeBudgets(budgets);
  }

  return {
    kind: "within",
    measuredP95: measured,
    budget: existing,
    message: `\`${name}\` p95=${measured.toFixed(1)}ms ≤ 预算 ${existing.p95Ms}ms`,
  };
}
