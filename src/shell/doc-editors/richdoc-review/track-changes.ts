// ============================================================================
// @oceanleo/ui — 富文档审阅层：修订（track changes）的录制与接受/拒绝
// ----------------------------------------------------------------------------
// 三条贯穿本文件的规则，改动前先读：
//
// 1. **删除不真删。** 删一段文字只是给它盖 `richdocDeletion`；文字留在文档里，
//    直到有人「接受」这处修订才真的移除。真删了就没有「拒绝」可言——
//    拒绝一处删除的语义就是「把文字留下」，文字都没了拿什么留。
//
// 2. **接受/拒绝是一次事务。** 全部改动写进同一个 `Transaction`，
//    所以一次 Ctrl+Z 完整撤回。分成多个事务的话，「全部接受」要按 N 次撤销，
//    而且中间态是一份半接受的文档。
//
// 3. **关掉修订模式只影响「新编辑要不要被记录」，既有标记一个都不动。**
//    录制发生在插件的 `appendTransaction` 里，`isEnabled()` 返回 false 时
//    那段代码整个不跑；本文件没有任何一处会因为开关而去清标记。
//
// 本轮的缩小承诺（写进交付说明）：**只追踪 inline 内容的 `ReplaceStep`。**
// 结构性改动（合并段落、删掉整个表格行、改变节点类型）不被记录为修订。
// 理由是它们没有「盖个删除线留在原地」的对应物——一个被删掉的段落边界无法
// 既存在又不存在。做半套结构追踪比不做更危险：用户会以为它罩住了。
// ============================================================================

import { Extension } from "@tiptap/core";
import {
  Fragment,
  Mark,
  type Attrs,
  type MarkType,
  type Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import {
  RICHDOC_CHANGE_MARKS,
  RICHDOC_DELETION_MARK,
  RICHDOC_FORMAT_MARK,
  RICHDOC_INSERTION_MARK,
  RICHDOC_REVIEW_MARKS,
} from "./review-marks";
import {
  createReviewId,
  type RichDocAttribution,
  type RichDocChangeKind,
} from "./review-types";

/**
 * 打上这个 meta 的事务不会被录制成修订。
 * 我们自己产生的事务（录制、接受、拒绝）都带它，否则接受一处修订这件事
 * 会被当成一次新编辑再录一遍，死循环。
 * 外部调用方载入文档、程序化改写正文时也应该带上它。
 */
export const RICHDOC_TRACK_CHANGES_META = "richdocTrackChanges";

export const richDocTrackChangesPluginKey = new PluginKey(
  "richdocTrackChanges",
);

const MARK_TO_KIND: Record<string, RichDocChangeKind> = {
  [RICHDOC_INSERTION_MARK]: "insertion",
  [RICHDOC_DELETION_MARK]: "deletion",
  [RICHDOC_FORMAT_MARK]: "format",
};

const REVIEW_MARK_NAMES = new Set<string>(RICHDOC_REVIEW_MARKS);

/** 一处修订在正文里落到的一段连续文字。同一处修订可能被别的编辑切成好几段。 */
export interface RichDocChangeSegment {
  from: number;
  to: number;
  text: string;
  /** 仅格式修订有意义：改之前 / 改之后的非审阅 mark 集合（JSON 串）。 */
  before: string;
  after: string;
}

export interface RichDocChangeView extends RichDocAttribution {
  changeId: string;
  kind: RichDocChangeKind;
  at: string;
  /** 全部分段的并集范围，侧栏排序与跳转用。 */
  from: number;
  to: number;
  /** 全部分段按文档顺序拼起来的文字。 */
  text: string;
  segments: RichDocChangeSegment[];
}

function markAttribution(mark: Mark): RichDocAttribution & { at: string } {
  return {
    author: String(mark.attrs.author || ""),
    authorName: String(mark.attrs.authorName || ""),
    at: String(mark.attrs.at || ""),
  };
}

/**
 * 扫出文档里全部未处理的修订，按 `changeId` 归并、按位置升序。
 *
 * 归并的依据是 `changeId` 而不是相邻——连续打字被后来的编辑从中间切开时，
 * 它仍然是用户眼里的「同一处修改」，逐处接受必须把两段一起处理。
 */
export function listChanges(doc: ProseMirrorNode): RichDocChangeView[] {
  const byId = new Map<string, RichDocChangeView>();
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    for (const mark of node.marks) {
      const kind = MARK_TO_KIND[mark.type.name];
      if (!kind) continue;
      const changeId = String(mark.attrs.changeId || "");
      if (!changeId) continue;
      const segment: RichDocChangeSegment = {
        from: pos,
        to: pos + node.nodeSize,
        text: node.isText ? node.text || "" : "",
        before: String(mark.attrs.before ?? "[]"),
        after: String(mark.attrs.after ?? "[]"),
      };
      const existing = byId.get(changeId);
      if (!existing) {
        const attribution = markAttribution(mark);
        byId.set(changeId, {
          changeId,
          kind,
          ...attribution,
          from: segment.from,
          to: segment.to,
          text: segment.text,
          segments: [segment],
        });
        continue;
      }
      const last = existing.segments[existing.segments.length - 1];
      // 相邻分段合并回一段：文本节点会因为加粗、拆分等原因被切开，
      // 但那不是两处修订，侧栏不该显示成两条。
      if (last && last.to === segment.from && last.before === segment.before) {
        last.to = segment.to;
        last.text += segment.text;
      } else {
        existing.segments.push(segment);
      }
      existing.from = Math.min(existing.from, segment.from);
      existing.to = Math.max(existing.to, segment.to);
      existing.text += segment.text;
    }
    return true;
  });
  return [...byId.values()].sort((left, right) => {
    if (left.from !== right.from) return left.from - right.from;
    return left.changeId.localeCompare(right.changeId);
  });
}

/** 文档里还有没有未处理的修订。导出闸口用它决定要不要拦。 */
export function hasPendingChanges(doc: ProseMirrorNode): boolean {
  return listChanges(doc).length > 0;
}

function reviewMarkType(schema: Schema, name: string): MarkType | null {
  return schema.marks[name] ?? null;
}

function nonReviewMarksJson(marks: readonly Mark[]): string {
  return JSON.stringify(
    marks
      .filter((mark) => !REVIEW_MARK_NAMES.has(mark.type.name))
      .map((mark) => mark.toJSON()),
  );
}

function parseMarksJson(schema: Schema, raw: string): Mark[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const marks: Mark[] = [];
  for (const entry of parsed) {
    try {
      marks.push(Mark.fromJSON(schema, entry));
    } catch {
      // 文档在别的版本里存过一个本地 schema 不认识的 mark。跳过它比整份拒绝好：
      // 还原不了一条格式，不该让整处修订都拒绝不掉。
    }
  }
  return marks;
}

function hasMarkNamed(
  node: ProseMirrorNode,
  name: string,
  predicate?: (mark: Mark) => boolean,
): boolean {
  return node.marks.some(
    (mark) => mark.type.name === name && (!predicate || predicate(mark)),
  );
}

/** 把事务标成「我们自己搞出来的」，录制插件据此跳过它。 */
export function markTrackingHandled(tr: Transaction, reason: string) {
  tr.setMeta(RICHDOC_TRACK_CHANGES_META, reason);
  return tr;
}

export interface TrackedChangeOptions {
  changeId?: string;
  at?: string;
}

function attributionAttrs(
  attribution: RichDocAttribution,
  changeId: string,
  at: string,
): Attrs {
  return {
    changeId,
    author: attribution.author,
    authorName: attribution.authorName,
    at,
  };
}

/**
 * 追踪式删除：不移除文字，给范围盖 `richdocDeletion`。
 *
 * **一个例外**：范围内属于同一作者、尚未被接受的 `richdocInsertion` 文字直接真删。
 * 那段文字从来没有进过正文——它本身就是这一轮还没被接受的插入，
 * 自己把自己写下的字删掉，留一条删除线是纯噪音。换个作者就不适用：
 * 别人正在提议加进来的内容，我要删掉它得留痕给他看。
 *
 * @returns 这次删除的 `changeId`；范围内无可处理内容时返回空串。
 */
export function trackedDelete(
  tr: Transaction,
  from: number,
  to: number,
  attribution: RichDocAttribution,
  options: TrackedChangeOptions = {},
): string {
  const schema = tr.doc.type.schema;
  const deletionType = reviewMarkType(schema, RICHDOC_DELETION_MARK);
  if (!deletionType || to <= from) return "";
  const changeId = options.changeId || createReviewId("chg");
  const at = options.at || new Date().toISOString();

  const toMark: Array<{ from: number; to: number }> = [];
  const toRemove: Array<{ from: number; to: number }> = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return true;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (end <= start) return true;
    if (
      hasMarkNamed(
        node,
        RICHDOC_INSERTION_MARK,
        (mark) => String(mark.attrs.author || "") === attribution.author,
      )
    ) {
      toRemove.push({ from: start, to: end });
      return true;
    }
    // 已经盖过删除线的不重复盖：再删一次已删除的文字在办公语义里是无操作。
    if (hasMarkNamed(node, RICHDOC_DELETION_MARK)) return true;
    toMark.push({ from: start, to: end });
    return true;
  });

  if (!toMark.length && !toRemove.length) return "";

  const mark = deletionType.create(
    attributionAttrs(attribution, changeId, at),
  );
  // 先盖标记再真删：`addMark` 不移动任何位置，所以标记阶段用原始坐标是安全的。
  for (const span of toMark) tr.addMark(span.from, span.to, mark);
  // 真删从后往前，否则前一次删除会让后面所有位置失准。
  for (const span of [...toRemove].sort((a, b) => b.from - a.from)) {
    tr.delete(span.from, span.to);
  }
  markTrackingHandled(tr, "tracked-delete");
  return toMark.length ? changeId : "";
}


export interface TrackedFormatChange {
  /** 要加上的 mark（已经带好 attrs）。 */
  add?: readonly Mark[];
  /** 要摘掉的 mark 类型。 */
  remove?: readonly MarkType[];
}

/**
 * 追踪式格式修改：应用格式，同时盖 `richdocFormatChange`，
 * 并把**改之前**的非审阅 mark 集合原样存进 `before`。
 *
 * 存 `before` 不是为了好看：拒绝一处格式修订的语义是「还原成改之前的样子」，
 * 不存就只剩「接受」一个选项，那不叫修订。
 *
 * `before` 逐段记录——一次选中可能横跨粗体段与普通段，两段的还原目标不同。
 */
export function trackedFormat(
  tr: Transaction,
  from: number,
  to: number,
  change: TrackedFormatChange,
  attribution: RichDocAttribution,
  options: TrackedChangeOptions = {},
): string {
  const schema = tr.doc.type.schema;
  const formatType = reviewMarkType(schema, RICHDOC_FORMAT_MARK);
  if (!formatType || to <= from) return "";
  const changeId = options.changeId || createReviewId("chg");
  const at = options.at || new Date().toISOString();
  const added = change.add ?? [];
  const removed = change.remove ?? [];
  if (!added.length && !removed.length) return "";

  const spans: Array<{ from: number; to: number; before: string; after: string }> =
    [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return true;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (end <= start) return true;
    // `readonly`：`filter` 给的是 `Mark[]`，但 `addToSet` 回的是 `readonly Mark[]`，
    // 不标这一下这行赋值过不了 tsc（TS4104）。ProseMirror 的 mark 集合本来就是不可变的。
    let after: readonly Mark[] = node.marks.filter(
      (mark) => !removed.some((type) => type.name === mark.type.name),
    );
    for (const mark of added) after = mark.addToSet(after);
    spans.push({
      from: start,
      to: end,
      before: nonReviewMarksJson(node.marks),
      after: nonReviewMarksJson(after),
    });
    return true;
  });
  if (!spans.length) return "";

  for (const type of removed) tr.removeMark(from, to, type);
  for (const mark of added) tr.addMark(from, to, mark);
  for (const span of spans) {
    tr.addMark(
      span.from,
      span.to,
      formatType.create({
        ...attributionAttrs(attribution, changeId, at),
        before: span.before,
        after: span.after,
      }),
    );
  }
  markTrackingHandled(tr, "tracked-format");
  return changeId;
}

type DecisionOp =
  | { op: "delete"; from: number; to: number }
  | { op: "unmark"; from: number; to: number; markName: string }
  | { op: "restore"; from: number; to: number; before: string };

/**
 * 接受/拒绝的全部语义就是这张表：
 *
 * |        | 接受                  | 拒绝                          |
 * |--------|-----------------------|-------------------------------|
 * | 插入   | 摘 mark，文字留下      | 删掉文字                       |
 * | 删除   | **真删文字**           | 摘 mark，文字留下              |
 * | 格式   | 摘 mark，格式留下      | 按 `before` 还原 marks + 摘 mark |
 */
function decisionOps(
  change: RichDocChangeView,
  decision: "accept" | "reject",
): DecisionOp[] {
  const ops: DecisionOp[] = [];
  for (const segment of change.segments) {
    const span = { from: segment.from, to: segment.to };
    if (change.kind === "insertion") {
      ops.push(
        decision === "accept"
          ? { op: "unmark", ...span, markName: RICHDOC_INSERTION_MARK }
          : { op: "delete", ...span },
      );
      continue;
    }
    if (change.kind === "deletion") {
      ops.push(
        decision === "accept"
          ? { op: "delete", ...span }
          : { op: "unmark", ...span, markName: RICHDOC_DELETION_MARK },
      );
      continue;
    }
    if (decision === "reject") {
      ops.push({ op: "restore", ...span, before: segment.before });
    }
    ops.push({ op: "unmark", ...span, markName: RICHDOC_FORMAT_MARK });
  }
  return ops;
}

function applyDecisionOps(tr: Transaction, ops: DecisionOp[]): number {
  if (!ops.length) return 0;
  const schema = tr.doc.type.schema;
  const base = tr.mapping.maps.length;
  // 从文档末尾往前处理，且每一步都把坐标过一遍本次事务新增的 mapping。
  // 单靠倒序在「拒绝插入」删掉文字、同一段上还压着格式修订」这类重叠场景下不够；
  // 单靠 mapping 又会让读代码的人以为顺序无所谓。两个都做，成本是零。
  const ordered = [...ops].sort((left, right) => right.from - left.from);
  let applied = 0;
  for (const op of ordered) {
    const mapping = tr.mapping.slice(base);
    const from = mapping.map(op.from, 1);
    const to = mapping.map(op.to, -1);
    if (to <= from) continue;
    if (op.op === "delete") {
      tr.delete(from, to);
      applied += 1;
      continue;
    }
    if (op.op === "unmark") {
      const type = reviewMarkType(schema, op.markName);
      if (!type) continue;
      tr.removeMark(from, to, type);
      applied += 1;
      continue;
    }
    for (const name of Object.keys(schema.marks)) {
      if (REVIEW_MARK_NAMES.has(name)) continue;
      tr.removeMark(from, to, schema.marks[name]);
    }
    for (const mark of parseMarksJson(schema, op.before)) {
      tr.addMark(from, to, mark);
    }
    applied += 1;
  }
  return applied;
}

function decide(
  tr: Transaction,
  changeId: string,
  decision: "accept" | "reject",
): boolean {
  const change = listChanges(tr.doc).find(
    (candidate) => candidate.changeId === changeId,
  );
  if (!change) return false;
  const applied = applyDecisionOps(tr, decisionOps(change, decision));
  if (!applied) return false;
  markTrackingHandled(tr, `${decision}-change`);
  return true;
}

function decideAll(
  tr: Transaction,
  decision: "accept" | "reject",
): number {
  const changes = listChanges(tr.doc);
  if (!changes.length) return 0;
  const ops = changes.flatMap((change) => decisionOps(change, decision));
  const applied = applyDecisionOps(tr, ops);
  if (!applied) return 0;
  markTrackingHandled(tr, `${decision}-all`);
  return changes.length;
}

/** 接受一处修订。全部改动在同一个事务里 ⇒ 一次撤销完整回退。 */
export function acceptChange(tr: Transaction, changeId: string): boolean {
  return decide(tr, changeId, "accept");
}

/** 拒绝一处修订。 */
export function rejectChange(tr: Transaction, changeId: string): boolean {
  return decide(tr, changeId, "reject");
}

/** 接受全部修订，同一个事务。@returns 处理掉的修订处数。 */
export function acceptAllChanges(tr: Transaction): number {
  return decideAll(tr, "accept");
}

/** 拒绝全部修订，同一个事务。@returns 处理掉的修订处数。 */
export function rejectAllChanges(tr: Transaction): number {
  return decideAll(tr, "reject");
}

/**
 * 摘掉全部审阅 mark，不改任何文字。
 * 「导出纯净文档」用它 —— 它与接受/拒绝的区别是**它不做任何取舍**，
 * 只是把痕迹抹掉，所以只能用在已经做过取舍之后。
 */
export function clearReviewMarks(tr: Transaction): Transaction {
  const schema = tr.doc.type.schema;
  const size = tr.doc.content.size;
  for (const name of RICHDOC_REVIEW_MARKS) {
    const type = reviewMarkType(schema, name);
    if (type) tr.removeMark(0, size, type);
  }
  return markTrackingHandled(tr, "clear-review-marks");
}

export interface TrackChangesPluginOptions {
  /** 修订模式开关。返回 false 时**只是不再记录新编辑**，既有标记原样保留。 */
  isEnabled: () => boolean;
  getAttribution: () => RichDocAttribution;
  now?: () => string;
}

function shouldSkipTracking(tr: Transaction): boolean {
  if (tr.getMeta(RICHDOC_TRACK_CHANGES_META)) return true;
  // 撤销/重做产生的事务已经是历史回放，再录一遍会让撤销变成一次新插入。
  if (tr.getMeta("history$")) return true;
  if (tr.getMeta("addToHistory") === false) return true;
  // tiptap 的 `setContent`（载入文档、恢复草稿）走这条。整篇正文不是用户敲的。
  if (tr.getMeta("preventUpdate")) return true;
  return false;
}

function inlineOnlySurvivors(
  fragment: Fragment,
  deletionMark: Mark,
  author: string,
): Fragment {
  const kept: ProseMirrorNode[] = [];
  fragment.forEach((child) => {
    if (!child.isInline) return;
    // 自己刚插入、还没被接受的文字：真删，不留删除线（同 `trackedDelete` 的例外）。
    if (
      hasMarkNamed(
        child,
        RICHDOC_INSERTION_MARK,
        (mark) => String(mark.attrs.author || "") === author,
      )
    ) {
      return;
    }
    // 已经是删除标记的文字：用户在删「已经删掉的东西」，无操作。
    if (hasMarkNamed(child, RICHDOC_DELETION_MARK)) return;
    kept.push(child.mark(deletionMark.addToSet(child.marks)));
  });
  return Fragment.from(kept);
}

/**
 * 录制插件：把用户的每一次编辑翻译成修订标记。
 *
 * 插入 —— 给新内容盖 `richdocInsertion`。**已经继承到同作者插入标记的那一段跳过**：
 * mark 的 `inclusive: true` 让连续打字自动带上前一个字的标记（连同它的 changeId），
 * 这正是我们要的归并；这时再盖一个新 changeId 的标记会让一句话变成两处修订。
 *
 * 删除 —— 把被移除的内容从**改动前的文档**里取回来，盖 `richdocDeletion` 重新插回去。
 * 这是 track-changes 的标准手法：编辑器照常执行删除，插件随后把它撤销成一个标记。
 *
 * 只处理 inline 的 `ReplaceStep`；结构性改动不追踪，见文件头的缩小承诺。
 */
export function richDocTrackChangesPlugin(options: TrackChangesPluginOptions) {
  return new Plugin({
    key: richDocTrackChangesPluginKey,
    appendTransaction(transactions, _oldState, newState) {
      if (!options.isEnabled()) return null;
      const relevant = transactions.filter(
        (candidate) => candidate.docChanged && !shouldSkipTracking(candidate),
      );
      if (!relevant.length) return null;

      const schema = newState.schema;
      const insertionType = reviewMarkType(schema, RICHDOC_INSERTION_MARK);
      const deletionType = reviewMarkType(schema, RICHDOC_DELETION_MARK);
      if (!insertionType || !deletionType) return null;

      const attribution = options.getAttribution();
      const at = options.now ? options.now() : new Date().toISOString();
      const tr = newState.tr;
      const base = tr.mapping.maps.length;
      const remap = (pos: number, assoc: 1 | -1) =>
        tr.mapping.slice(base).map(pos, assoc);

      for (const source of relevant) {
        for (let index = 0; index < source.steps.length; index += 1) {
          const step = source.steps[index];
          if (!(step instanceof ReplaceStep)) continue;
          const docBefore = source.docs[index];
          if (!docBefore) continue;
          // 这一步之后到该事务结束为止的 mapping：把 step 坐标搬到 newState.doc 上。
          const rest = source.mapping.slice(index + 1);

          const insertedSize = step.slice.size;
          if (insertedSize > 0) {
            const insertFrom = rest.map(step.from, -1);
            const insertTo = rest.map(step.from + insertedSize, 1);
            markInsertedRange(
              tr,
              remap(insertFrom, -1),
              remap(insertTo, 1),
              insertionType,
              attribution,
              at,
            );
          }

          if (step.to > step.from) {
            const removed = docBefore.slice(step.from, step.to);
            // openStart/openEnd 非零 ⇒ 这一刀切过了块边界，属于结构性改动。
            if (removed.openStart !== 0 || removed.openEnd !== 0) continue;
            const survivors = inlineOnlySurvivors(
              removed.content,
              deletionType.create(
                attributionAttrs(
                  attribution,
                  createReviewId("chg"),
                  at,
                ),
              ),
              attribution.author,
            );
            if (!survivors.size) continue;
            // 删掉的文字放回被替换区间的**起点**，新打的字排在它后面——
            // 与 Word 的呈现一致：先看到划掉的旧内容，再看到新内容。
            tr.insert(remap(rest.map(step.from, -1), -1), survivors);
          }
        }
      }

      if (tr.steps.length === base) return null;
      return markTrackingHandled(tr, "record");
    },
  });
}

/**
 * 给新插入的范围盖插入标记，逐个 inline 节点判断。
 * 已经带着**同作者**插入标记的节点跳过——那是 `inclusive: true` 让连续打字
 * 自动继承来的同一处修订，重复盖会把一句话拆成两处。
 */
function markInsertedRange(
  tr: Transaction,
  from: number,
  to: number,
  insertionType: MarkType,
  attribution: RichDocAttribution,
  at: string,
) {
  if (to <= from) return;
  const spans: Array<{ from: number; to: number; changeId: string }> = [];
  let inheritedId = "";
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return true;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (end <= start) return true;
    const existing = node.marks.find(
      (mark) =>
        mark.type.name === RICHDOC_INSERTION_MARK &&
        String(mark.attrs.author || "") === attribution.author,
    );
    if (existing) {
      inheritedId = String(existing.attrs.changeId || "") || inheritedId;
      return true;
    }
    spans.push({ from: start, to: end, changeId: "" });
    return true;
  });
  if (!spans.length) return;
  // 与相邻的既有插入同属一次连续输入时沿用它的 changeId，否则开一处新的。
  const changeId = inheritedId || createReviewId("chg");
  const mark = insertionType.create(
    attributionAttrs(attribution, changeId, at),
  );
  for (const span of spans) tr.addMark(span.from, span.to, mark);
}

/**
 * 把录制插件包成 tiptap 扩展，好和四个 mark 一起进 `extensions` 数组。
 *
 * `options` 里的两个回调**必须是稳定引用**（调用方用 ref 兜住）：
 * 扩展数组一旦变化 tiptap 会重建整个编辑器，正在编辑的人会丢掉光标与撤销栈。
 */
export function richDocTrackChangesExtension(
  options: TrackChangesPluginOptions,
) {
  return Extension.create({
    name: "richDocTrackChangesRecorder",
    addProseMirrorPlugins() {
      return [richDocTrackChangesPlugin(options)];
    },
  });
}

/** 三种修订 mark 的名字，导出给 UI 侧做筛选。 */
export const RICHDOC_TRACKED_MARKS = RICHDOC_CHANGE_MARKS;
