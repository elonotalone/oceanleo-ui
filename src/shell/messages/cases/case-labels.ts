// 内容处置界面上的名字与说明：案件对象的种类、来源、状态、原因、失败提示。
// 每一句都是 `tt("字面量")`——文案闸（tests/i18n-tt-key-coverage.test.mjs）只认字面量，别改成查表后再 tt。
// 旧门户面板（app/settings/content-cases/content-cases-panel.tsx）里的 SOURCE_LABEL / KIND_LABEL / statusLabel 搬到这里，
// 并补全：Bay 的应用 / 课程 / 套餐 / 留言、LeoChat 的消息 / 账号 / 会话，以及原因代码。
import type { UITranslate } from "../../../i18n/ui/useUI";
import {
  daysUntil,
  formatCaseTime,
  isFuture,
  reasonCodeOf,
  type OwnerCase,
} from "../../../lib/moderation/case-model";
import type { ModerationFailure } from "../../../lib/moderation/client";

/** 被处置的是什么。认不出的种类写「内容」，不亮内部代码。 */
export function kindLabel(tt: UITranslate, kind: string): string {
  switch (kind) {
    case "talent_profile":
      return tt("主页");
    case "talent_service":
      return tt("人工服务");
    case "talent_showcase":
      return tt("作品集");
    case "talent_review":
      return tt("评价");
    case "talent_message":
      return tt("私信");
    case "talent_demand":
      return tt("需求");
    case "talent_contract":
      return tt("合同");
    case "im_message":
      return tt("聊天消息");
    case "im_user":
      return tt("聊天账号");
    case "im_conversation":
      return tt("聊天会话");
    case "game":
      return tt("游戏");
    case "url":
      return tt("链接");
    case "bay_app":
      return tt("网站与软件服务");
    case "bay_app_thread":
      return tt("留言");
    case "bay_lesson":
      return tt("课程");
    case "bay_bundle":
      return tt("套餐");
    default:
      return tt("内容");
  }
}

/** 谁提的。`staydown`（指纹拦截）对用户就是机器检测。认不出的来源不写。 */
export function sourceLabel(tt: UITranslate, source: string): string {
  switch (source) {
    case "user_report":
      return tt("举报");
    case "rights_notice":
      return tt("权利通知");
    case "machine":
    case "staydown":
      return tt("机器检测");
    case "authority":
      return tt("主管部门");
    case "operator":
      return tt("人工登记");
    default:
      return "";
  }
}

/** 一眼看懂的状态。反通知处理中带倒计时（离恢复还有几日）。 */
export function statusLabel(tt: UITranslate, row: OwnerCase, now: number = Date.now()): string {
  switch (row.status) {
    case "awaiting_counter": {
      const days = daysUntil(row.restore_at, now);
      if (days === null || days === 0) return tt("反通知中，等待恢复");
      return tt("反通知中 {n} 日后恢复", { n: days });
    }
    case "taken_down":
      return tt("已下架");
    case "restored":
      return tt("已恢复");
    case "dismissed":
      return tt("已驳回");
    case "executed":
      return tt("已执行");
    default:
      return row.hidden ? tt("已隐藏") : tt("待处理");
  }
}

/** 状态对「我的内容现在怎么样」的一句话解释。 */
export function statusNote(tt: UITranslate, row: OwnerCase, locale?: string, now: number = Date.now()): string {
  switch (row.status) {
    case "awaiting_counter": {
      const date = formatCaseTime(row.restore_at, locale);
      return date ? tt("反通知已收到。{date} 前平台若没有进一步维持下架，内容会自动恢复。", { date }) : "";
    }
    case "taken_down":
      return tt("内容已下架，别人现在看不到。");
    case "restored":
      return tt("内容已恢复，别人又能看到了。");
    case "dismissed":
      return tt("经核查没有发现问题，内容保持可见。");
    case "executed":
      return tt("已按主管部门的要求执行。");
    default:
      if (row.hidden) return tt("内容已被暂时隐藏，别人现在看不到。");
      if (isFuture(row.due_at, now)) {
        return tt("平台会在 {date} 前判断；到时仍未决，内容会先被暂时隐藏。", {
          date: formatCaseTime(row.due_at, locale, true),
        });
      }
      return tt("平台正在处理，内容目前没有被隐藏。");
  }
}

/** 原因。只翻认得的代码；认不出的、「其他」不写（不把举报人的原话或内部代码亮给被举报的人）。 */
export function reasonLabel(tt: UITranslate, reason: string): string {
  switch (reasonCodeOf(reason)) {
    case "spam":
      return tt("垃圾信息或广告");
    case "harassment":
      return tt("骚扰、辱骂或威胁");
    case "fraud":
      return tt("涉嫌欺诈");
    case "illegal":
      return tt("违法或侵权内容");
    case "fake":
      return tt("虚假信息或夸大宣传");
    case "offsite":
      return tt("要求站外交易或预付款");
    case "plagiarism":
      return tt("抄袭、盗用他人作品");
    case "sexual":
      return tt("色情或低俗内容");
    case "violence":
      return tt("暴力或血腥内容");
    case "hate":
      return tt("仇恨或歧视内容");
    case "ip_infringement":
      return tt("侵犯知识产权");
    case "malware":
      return tt("恶意软件");
    case "staydown":
      return tt("与已下架内容重复");
    case "machine":
      return tt("未通过内容安全审核");
    default:
      return "";
  }
}

export type CaseFailureScope = "list" | "counter" | "appeal";

/** 请求失败时给用户看的话：按归类选，不亮网关原话。 */
export function failureMessage(tt: UITranslate, failure: ModerationFailure, scope: CaseFailureScope): string {
  switch (failure) {
    case "unauthorized":
      return tt("请先登录。");
    case "not_found":
      return tt("找不到这一件处置记录。它可能已被撤销，或不属于当前账号。");
    case "network":
      return tt("网络不通，请稍后再试。");
    case "invalid":
      if (scope === "counter") return tt("请填完整反通知：陈述、联系邮箱、两条声明、签名");
      if (scope === "appeal") return tt("请填写申诉陈述");
      return tt("加载失败");
    default:
      return scope === "list" ? tt("加载失败") : tt("提交失败，请稍后再试。");
  }
}
