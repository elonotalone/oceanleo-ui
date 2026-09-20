// Enterprise + MCP Apps copy. Keys must match tt() literals in:
// OrgPage, OrgMembership, AccountPage, ByokKeys, PluginsPage,
// PayerSelector, ComposerAppsBar.

import { LOCALES, type Locale } from "../../config";

export const ENTERPRISE_COPY_SOURCE = {
  // --- OrgPage ---
  daysN: "{n} 天",
  capUpdated: "上限已更新",
  tasks: "任务",
  noOrgPagePermission: "你没有查看这个组织的权限。",
  notInAnyOrgGoAccount:
    "你还不属于任何组织。拿到负责人发的邀请链接后，在账户页申请加入。",
  topupNotReady: "充值还没上线",
  copyFailedManual: "复制失败，请手动选中链接复制。",
  approved: "已通过",
  rejected: "已驳回",
  invoiceTitle: "开票抬头",
  currentOrg: "当前组织",
  pendingJoinRequests: "待审批的入组申请",
  outcomes: "成果",
  myRole: "我的身份",
  byModelNotReady: "按模型分布还没上线",
  minTopupAmount: "最低起充 {amount}",
  lastActive: "最后活跃",
  expiresAt: "有效期至",
  spentThisMonth: "本月已花",
  monthSpend: "本月花费",
  permissions: "权限",
  callCount: "次数",
  monthlyCap: "每月上限",
  noPendingRequests: "没有待审批的申请",
  createInviteLink: "生成邀请链接",
  viewAllTasks: "看全部任务",
  viewOrgPage: "看组织页",
  orgBalance: "组织余额",
  orgName: "组织名",
  editInvoice: "编辑抬头",
  spend: "花费",
  role: "角色",
  trendNotReady: "趋势这一块还没上线",
  notReadyYet: "还没上线",
  noMembersYet: "还没有成员。生成一条邀请链接发给同事。",
  noSpendInPeriod: "这段时间没有花费",
  approve: "通过",
  reject: "驳回",

  // --- ByokKeys (Cursor / 自带 key) ---
  cursorKeySaved: "Cursor key 已保存在这台设备。",
  cursorCloudHint:
    "Cursor 开一台云端机器克隆你的 GitHub 仓库、跑完可自动开 PR。需要你的 Cursor 账号已连通 GitHub 并授权该仓库，否则会被 Cursor 拒绝（ERROR_GITHUB_NO_USER_CREDENTIALS）。",
  cursorRejectedKey:
    "Cursor 拒绝了这把 key（无效或已撤销），请重新生成后再保存。",
  cursorQuota: "Cursor 额度或频率受限，请稍后再试。",
  cursorCloudRuntime: "云端（Cursor 的机器）",
  cursorGithubNotConnected:
    "你的 Cursor 账号还没有连通 GitHub：请在 Cursor Dashboard → Integrations 里连接后重试。",
  saveAndVerify: "保存并校验",
  getCursorKeyLink:
    "去 Cursor Dashboard → Integrations → User API Keys 生成 →",
  whereToRun: "在哪里跑",
  verifiedAs: "已校验：",
  cursorLocalRuntime: "本机（你已配对的电脑）",
  pasteCrsrKey: "粘贴 crsr_ 开头的 key",
  codingAgentNotChat: "编码 agent（不用于聊天）",
  codingAgentNotChatModel: "编码 agent，不是聊天模型",
  enterCursorApiKey: "请填入 Cursor API key",
  notCursorApiKey: "这不是 Cursor 的 API Key（应以 crsr_ 开头）。",
  cursorKeyPrivacy:
    "这把 key 只用来在 OceanLeo 里启动、追问、查看和取消你自己的 Cursor 编码 agent，花的是你自己的 Cursor 额度，OceanLeo 不扣钱包。它和上面的 key 一样只以加密形式保存在这台设备的浏览器里，服务器不保存、不写日志、响应里也不会出现；要撤销，删掉下方表格里的 Cursor 一行即可。",
  cursorTimeout: "连接 Cursor 超时，请稍后再试。",
  cursorLocalHint:
    "通过设备桥在你自己的电脑上跑，文件不离开本机。那台电脑要先装好 Cursor CLI 并登录；这里的 key 不会下发到那台机器。",
  recheck: "重新校验",
  unnamedKey: "（未命名 key）",

  // --- PluginsPage ---
  mcpEndpointUrl: "MCP 服务地址（你的专属 URL）",
  toolsCountN: "{n} 个工具",
  connectForOrg: "为组织连接",
  connectMcpForOrg: "为组织连接 MCP",
  connectOnceMembersInherit:
    "在组织里连一次，组织成员的插件页会自动出现这条连接，成员不用各自填凭证。",
  disabled: "已停用",
  enabled: "已启用",
  visibleToMembers: "成员可见",
  disconnect: "断开",
  providedByOrg: "由组织 {name} 提供",
  providedByOrgHeading: "组织提供",
  orgConnectionsManaged:
    "组织提供的连接由管理员统一管理，你可以直接使用，不需要填凭证。",
  orgHasNoMcp: "这个组织还没有连接任何 MCP 服务器。",
  connecting: "连接中…",
  connectorId: "连接器标识",
  connectFailedRetry: "连接失败，请检查地址与凭证后重试。",
  connectAndVerify: "连接并验证",
  whichOrgToConnect: "连给哪个组织",

  // --- OrgMembership ---
  youWillJoinOrg: "你将申请加入「{org}」",
  notInAnyOrgApplyBelow:
    "你还不属于任何组织。拿到负责人发的邀请链接后，在下面申请加入。",
  whatOrgCanSee: "加入后这个组织能看到什么",
  joinOrg: "加入组织",
  capReached: "已达上限",
  pasteInviteCode:
    "把负责人发给你的邀请码贴在这里；从邀请链接打开时会自动带入。",
  monthSpendOverCap: "本月花费 / 上限",
  statusOk: "正常",
  applying: "申请中…",
  requestToJoin: "申请加入",
  admin: "管理员",
  orgAdminViewAudit:
    "组织管理员每次打开你用组织钱包做的任务，都会在这里留一条记录。",
  whoViewedMe: "谁看过我",
  noOneViewedYet: "还没有人看过",
  thisOrg: "这个组织",
  inviteCode: "邀请码",
  joinsImmediately: "（申请后立即加入）",
  needsOwnerApproval: "（需负责人通过）",

  // --- ComposerAppsBar ---
  opening: "正在打开…",
  backToAppList: "返回应用列表",
  toolReturnedNothing: "这个工具没有返回可显示的内容。",
  appUnavailable: "这个应用暂时打不开，稍后再试。",

  // --- PayerSelector ---
  personalWallet: "个人钱包",
  orgGoneFallback: "之前选的组织已停用，或你已不在该组织里。",
  switchedToPersonal: "已切回个人钱包",
  whoPaysThisTime: "这次谁付钱",

  // --- AccountPage ---
  myOrgsMenuDesc: "你所在的组织、本月在每个组织花了多少、谁看过你的任务",
  myOrgs: "我的组织",
} as const;

export type EnterpriseCopyName = keyof typeof ENTERPRISE_COPY_SOURCE;
export type EnterpriseCopyMessages = Record<EnterpriseCopyName, string>;

export const ENTERPRISE_COPY_KEYS: readonly string[] = Object.values(
  ENTERPRISE_COPY_SOURCE,
);

export function enterpriseDictionaryFrom(
  messages: EnterpriseCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(ENTERPRISE_COPY_SOURCE) as EnterpriseCopyName[]).map((name) => [
      ENTERPRISE_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

export const ENTERPRISE_COPY_ZH: EnterpriseCopyMessages = {
  ...ENTERPRISE_COPY_SOURCE,
};

export function assembleEnterpriseCopy(
  translations: Record<Exclude<Locale, "zh">, EnterpriseCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      enterpriseDictionaryFrom(
        locale === "zh" ? ENTERPRISE_COPY_ZH : translations[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
