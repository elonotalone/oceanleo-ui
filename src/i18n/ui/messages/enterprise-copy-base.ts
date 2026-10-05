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

  // --- OrgMcpSection（组织页共用连接器；「添加连接器」沿用插件浮层同一句） ---
  orgSharedConnectors: "共用连接器",
  orgSharedConnectorsHintAdmin:
    "连一次，这个组织里的人都能用，不用各自再填密钥。",
  orgSharedConnectorsHintMember: "管理员连好的工具，你可以直接用。",
  orgSharedConnectorsEmpty: "还没有共用连接器。",
  orgSharedServerUrl: "服务地址",
  orgSharedSecret: "密钥",
  orgSharedCustomService: "自建服务",
  orgSharedConnectorKind: "连接器",
  mcpEndpointUrl: "MCP 服务地址（你的专属 URL）",
  toolsCountN: "{n} 个工具",
  disabled: "已停用",
  enabled: "已启用",
  visibleToMembers: "成员可见",
  connecting: "连接中…",
  connectFailedRetry: "连接失败，请检查地址与凭证后重试。",
  connectAndVerify: "连接并验证",

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

  // --- W24 OrgMembership / org-api ---
  orgGone: "这个组织已经不在了。",
  agreeRequired: "请先阅读并勾选《OceanLeo 企业服务协议》。",
  joinDisclosurePaid:
    "用组织钱包付费的任务，组织管理员可以查看全部内容；用你个人钱包付费的任务，组织永远看不到。",
  joinDisclosureAudit: "每次查看都会留下记录，你可以在下面看到谁看过。",
  joinPending:
    "申请已提交，等负责人通过。通过后这里会出现这个组织，你也会收到一条站内通知。",
  joinJoined: "已加入「{org}」。现在可以在发任务时选择用这个组织的钱包付费。",
  joinRejected:
    "申请没有通过。负责人驳回了你的申请，或这个组织暂停了加入；有疑问请直接联系负责人。",
  joinExpired: "这条邀请链接已经过期或被撤销了。请负责人重新生成一条再发给你。",
  joinAlreadyMember: "你已经在这个组织里了，不需要再申请。",
  createOrg: "创建组织",
  iHaveReadAndAgree: "我已阅读并同意",
  enterpriseAgreementLink: "《OceanLeo 企业服务协议》",
  orgMemberRole: "组织成员",

  // --- W25 PluginsPage ---
  forwardMemberIdentity: "把成员身份转给这台服务器",
  forwardMemberIdentityHint:
    "开了以后服务器知道是哪位成员在操作、各看各的工作区；关着时服务器只知道是本组织。",

  // --- W23 OrgPage / PublishToOrgButton ---
  withdrawAsset: "撤回",
  orgLibrary: "组织库",
  orgLibraryEmpty: "组织库还是空的。成员可以从工作台把成果发布进来。",
  publishToOrg: "发布到组织",
  alreadyInNamedOrgLibrary: "已在 {name} 组织库",
  alreadyInNOrgLibraries: "已在 {n} 个组织库",
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
