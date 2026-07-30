/**
 * website-source 的物化与载入契约。
 *
 * 规格: docs/specs/oceanleo-material-and-game-v1/L1-carriers/website-source.md
 *  - §1.3 不可信内容边界 · §1.4 生成器锁 · §3.2 物化与载入状态机
 *  - §3.3 452 份未物化模板的处置 · §7 A10/A11 反孪生 · §9 C-5 / C-9
 *
 * 生成器锁(§1.4)在本模块的落地方式:**这里没有任何生成或写盘代码**。
 * 物化 MUST 走既有 `lib/template-website-source.ts` 与
 * `scripts/oceanleo-asset-website-templates-materialize.mjs`;
 * MUST NOT 新写第二套物化器。本模块只提供:
 *   (a) 状态机的合法/非法迁移判定;
 *   (b) 物化结果的验收判据(每一份都要过 §8.1 / §8.2);
 *   (c) 交给上限持有者的需求描述(`WEBSITE_MATERIALIZE_CAP_REQUEST`)。
 */

import {
  WEBSITE_SOURCE_CONSTANTS,
  type WebsiteSource,
} from "./website-source-schema";
import {
  assessWebsiteSourceCompleteness,
  validateWebsiteSource,
  type WebsiteCompletenessInput,
} from "./website-source-validate";

export type WebsiteSourceState =
  | "route-only"
  | "ir-generated"
  | "closure-resolved"
  | "registered"
  | "ready"
  | "dirty"
  | "saving"
  | "invalid"
  | "degraded";

/** §3.2 合法迁移表。 */
export const WEBSITE_SOURCE_TRANSITIONS: readonly {
  from: WebsiteSourceState;
  to: WebsiteSourceState;
  trigger: string;
}[] = Object.freeze([
  {
    from: "route-only",
    to: "ir-generated",
    trigger: "lib/template-website-source.ts 从模板 DNA 产出 website-source@1",
  },
  { from: "ir-generated", to: "invalid", trigger: "IR 未通过 §3.1 校验" },
  {
    from: "ir-generated",
    to: "closure-resolved",
    trigger: "全部 assets[] 与 dependencies[] 字节可取且 sha256 一致",
  },
  {
    from: "closure-resolved",
    to: "degraded",
    trigger: "部分图片缺失,但每个 section 仍有文本内容",
  },
  {
    from: "closure-resolved",
    to: "registered",
    trigger: "ArtifactContentInput 接受(含 source_manifest)",
  },
  { from: "registered", to: "ready", trigger: "预览与缩略图渲出且满足 §8.2" },
  { from: "ready", to: "dirty", trigger: "编辑器改动" },
  { from: "dirty", to: "saving", trigger: "提交" },
  { from: "saving", to: "ready", trigger: "收到新 revision_id" },
  {
    from: "saving",
    to: "dirty",
    trigger: "expected_revision_id 冲突,保留本地字节",
  },
]);

/** §3.2 非法迁移(MUST NOT 发生)。 */
export const WEBSITE_SOURCE_ILLEGAL_TRANSITIONS: readonly {
  from: WebsiteSourceState;
  to: WebsiteSourceState;
  why: string;
}[] = Object.freeze([
  {
    from: "route-only",
    to: "registered",
    why: "把现算 HTML 直接当字节入库 —— 合同 §3.5 硬禁令,MUST 经 IR 生成",
  },
  {
    from: "ir-generated",
    to: "registered",
    why: "跳过依赖闭包;complete_dependency_closure 会在缺 source_manifest 时拒绝",
  },
  { from: "degraded", to: "saving", why: "缺件态 MUST NOT 保存" },
  { from: "invalid", to: "ready", why: "非法 IR MUST NOT 上架" },
  {
    from: "saving",
    to: "invalid",
    why: "保存失败 MUST 退回 dirty 并保留字节",
  },
]);

export function isLegalWebsiteSourceTransition(
  from: WebsiteSourceState,
  to: WebsiteSourceState,
): boolean {
  if (
    WEBSITE_SOURCE_ILLEGAL_TRANSITIONS.some(
      (illegal) => illegal.from === from && illegal.to === to,
    )
  ) {
    return false;
  }
  return WEBSITE_SOURCE_TRANSITIONS.some(
    (legal) => legal.from === from && legal.to === to,
  );
}

/**
 * §1.3 + §9 C-9:不可信内容边界的清单。
 *
 * 这些面的唯一事实源在 `editor-sandbox-origin.ts` / `editor-protocol.ts` /
 * 后端 CORS 与 cookie 配置里。本载体**只读引用**,一行都不改;
 * 若某实现「必须」改这些才能跑通,MUST 停手上报(改动需安全闸 + 操作员批准)。
 */
export const WEBSITE_SOURCE_ISOLATION_INVARIANTS = Object.freeze([
  "用户生成的站点、预览与产物只从 oceanleo.app 服务,MUST NOT 从 oceanleo.com 服务",
  "MUST NOT 改动任何 CORS origin 正则",
  "MUST NOT 改动 cookie 域判定",
  "MUST NOT 改动 iframe sandbox 属性集",
  "MUST NOT 改动 postMessage 目标源",
  "编辑器预览 iframe MUST 保持既有 sandbox 属性集,MUST NOT 因预览不便而放宽",
] as const);

/**
 * §3.3:452 份未物化模板的处置需求 —— 交给份数上限持有者(5号)的**需求描述**,
 * 不是实现。本 owner 一行不改物化链,也不新写第二套物化器(§1.4)。
 *
 * 上一轮记的卡点(`materialize.mjs:109` 的 `const PER_APP = MATERIAL_MAX_COUNT`)
 * 已由 5号 在 oceandino@457870dc 解开:`PER_APP` 现在是
 * `materialCountFor(site).max`,逐站取自 `scripts/data/oceanleo-material-count-policy.json`。
 * 于是剩下的需求不再是「解绑」,而是**取值**:
 *   - 策略文件里 `sites.website` 仍是 `min 3 / max 4`,12 个 app × 4 = 48,
 *     正是 C39 的已物化数,452 份因此仍卡着;
 *   - 单站方案要装下 500 份需 `max ≥ ceil(500/12) = 42`,且 DB CHECK 的
 *     `positionUpperBound` 要同步 ≥ 42(现为 24,它是 max 的硬上界);
 *   - 双站方案(website + resume,各 12 app)需 `max ≥ ceil(500/24) = 21`。
 * 单站还是双站属于 D6 仲裁范围,本 owner 只给下界与每份的验收判据。
 */
export const WEBSITE_MATERIALIZE_CAP_REQUEST = Object.freeze({
  /** 已解开的卡点,留作交接时的对照,不再是当前阻塞项。 */
  resolvedBlocker: Object.freeze({
    symbol: "PER_APP = MATERIAL_MAX_COUNT",
    resolvedIn: "oceandino@457870dc",
    nowReadsFrom: "scripts/data/oceanleo-material-count-policy.json",
  }),
  /** 当前真正决定份数的两个取值点。 */
  capSites: Object.freeze([
    "scripts/data/oceanleo-material-count-policy.json → sites.website.max",
    "scripts/data/oceanleo-material-count-policy.json → positionUpperBound(须 ≥ 各站 max)",
  ] as const),
  currentPerAppCap: 4,
  currentPositionUpperBound: 24,
  websiteAppCount: 12,
  generatorLock: Object.freeze([
    "lib/template-website-source.ts",
    "scripts/oceanleo-asset-website-templates-materialize.mjs",
  ] as const),
  templateTotal: WEBSITE_SOURCE_CONSTANTS.C38_ASSET_TEMPLATE_TOTAL,
  materialized: WEBSITE_SOURCE_CONSTANTS.C39_MATERIALIZED_COUNT,
  pending: WEBSITE_SOURCE_CONSTANTS.C40_PENDING_COUNT,
  subclasses: WEBSITE_SOURCE_CONSTANTS.C41_TEMPLATE_SUBCLASS_COUNT,
  /** 500 / 12 app:单站装下全部 500 份所需的每 app 份数下界。 */
  singleSitePerAppMin: 42,
  /** 500 / 24 app:website + resume 双站方案的每 app 份数下界。 */
  twoSitePerAppMin: 21,
  /** 500 / 105 子类 ≈ 4.76:同子类变体数的下界,与总量下界是两件事。 */
  variantPerSubclassMin: 5,
  mustNot: Object.freeze([
    "把 sites.website.max 提过 positionUpperBound(DB CHECK 会在第 N+1 份抛 23514)",
    "改 MATERIAL_MAX_COUNT 的语义(影响全部 32 站的每 app 份数)",
    "新写第二套物化器(§1.4 生成器锁)",
    "把现算 HTML 字节直接入库凑数(§1.2 / §3.2 route-only → registered)",
  ] as const),
  acceptance: Object.freeze([
    "每一份物化产物过 assessWebsiteSourceCompleteness(§8.1 + §8.2)",
    "105 个子类之间 sections[].kind 种类构成有实质差异",
    "同子类的约 5 个变体两两 Jaccard < 0.85(C42)",
    "任意两份 Jaccard < 0.99(C43,反孪生)",
    "template-dna.ts 的 hash 种子确认改变 sections 结构,而不只是改色值(§3.3 末条 / F3)",
  ] as const),
} as const);

/**
 * §7 A10 / A11 与 §6 F3 / F8 的反孪生判据:对**结构**取 token 集算 Jaccard。
 *
 * token 只取区块语法、区块序、每区块的 item/action 形态与主题结构,
 * 因此「只换色值、只换 title」的换皮变体 token 集完全相同 → 1.0,
 * 直接落在 C43 孪生阈之上(这正是 F3 要抓的东西)。
 */
export function websiteStructureJaccard(
  left: WebsiteSource,
  right: WebsiteSource,
): number {
  const tokensOf = (source: WebsiteSource): Set<string> => {
    const tokens = new Set<string>();
    const sections = source.sections || [];
    sections.forEach((section, index) => {
      tokens.add(`kind:${section.kind}`);
      tokens.add(`order:${index}:${section.kind}`);
      tokens.add(
        `shape:${section.kind}:${(section.items || []).length}:${
          (section.actions || []).length
        }`,
      );
      if (section.background) {
        tokens.add(`bg:${section.kind}:${section.background}`);
      }
    });
    for (const page of source.pages || []) {
      tokens.add(`page:${page.path}:${(page.sectionIds || []).length}`);
    }
    return tokens;
  };
  const a = tokensOf(left);
  const b = tokensOf(right);
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export interface MaterializedTemplate {
  /** 模板子类标识(105 个子类之一)。 */
  subclass: string;
  /** 同子类内的变体标识。 */
  variant: string;
  source: WebsiteSource;
  metrics?: WebsiteCompletenessInput;
}

export type MaterializationRejection =
  | { code: "ir-invalid"; subclass: string; variant: string; detail: string }
  | { code: "incomplete"; subclass: string; variant: string; failed: string[] }
  | {
      code: "variant-too-similar";
      subclass: string;
      variants: [string, string];
      jaccard: number;
    }
  | {
      code: "twin";
      variants: [string, string];
      jaccard: number;
    };

export interface MaterializationVerdict {
  ok: boolean;
  accepted: number;
  rejections: MaterializationRejection[];
}

/**
 * 物化批次的验收判据(§3.3 第 2 条:「物化后的每一份 MUST 满足 §8.1 与 §8.2」)。
 * 本函数**不物化**任何东西 —— 它只判别人物化出来的结果能不能上架。
 */
export function judgeMaterializedBatch(
  batch: readonly MaterializedTemplate[],
): MaterializationVerdict {
  const rejections: MaterializationRejection[] = [];
  const valid: MaterializedTemplate[] = [];

  for (const entry of batch) {
    const validation = validateWebsiteSource(entry.source);
    if (!validation.ok) {
      rejections.push({
        code: "ir-invalid",
        subclass: entry.subclass,
        variant: entry.variant,
        detail: `schema ${validation.errors.length} 处 / 语义 ${validation.semantic.length} 处`,
      });
      continue;
    }
    const completeness = assessWebsiteSourceCompleteness(
      entry.source,
      entry.metrics || {},
    );
    if (!completeness.ok) {
      rejections.push({
        code: "incomplete",
        subclass: entry.subclass,
        variant: entry.variant,
        failed: completeness.failed,
      });
      continue;
    }
    valid.push(entry);
  }

  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const jaccard = websiteStructureJaccard(valid[i].source, valid[j].source);
      if (jaccard >= WEBSITE_SOURCE_CONSTANTS.C43_TWIN_THRESHOLD) {
        rejections.push({
          code: "twin",
          variants: [valid[i].variant, valid[j].variant],
          jaccard,
        });
        continue;
      }
      if (
        valid[i].subclass === valid[j].subclass &&
        jaccard >= WEBSITE_SOURCE_CONSTANTS.C42_FAMILY_JACCARD_MAX
      ) {
        rejections.push({
          code: "variant-too-similar",
          subclass: valid[i].subclass,
          variants: [valid[i].variant, valid[j].variant],
          jaccard,
        });
      }
    }
  }

  return {
    ok: rejections.length === 0,
    accepted: rejections.length ? 0 : valid.length,
    rejections,
  };
}
