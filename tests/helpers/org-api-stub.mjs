// usePluginsCatalog 从 org-api 取组织 MCP 连接。只桩 listMyOrgs / getOrg
// 时，编译图一走进插件目录就会整文件加载失败。

export const ORG_MCP_STUB_SOURCE = `
export async function listInheritedMcp() { return []; }
export async function listOrgMcpConnections() { return []; }
export async function deleteOrgMcpConnection() {}
export async function patchOrgMcpConnection() { return null; }
export async function upsertOrgMcpConnection() { return null; }
export async function setOrgMcpForwardIdentity() {}
export async function createInvite() { return { url: "", code: "", expiresAt: "" }; }
export async function createOrg() { return { id: "" }; }
export async function requestJoin() { return { status: "pending", orgName: "" }; }
export async function getMyOrgUsage() { return { monthlyMinor: 0, capMinor: null }; }
export async function listMembers() { return []; }
export async function listJoinRequests() { return []; }
export async function getOrgUsage() { return { windowDays: 7, points: [], byModel: [] }; }
export async function updateOrg() { return {}; }
export async function setMemberPermission() {}
export async function listMemberLimits() { return []; }
export async function setMemberLimits() {}
export async function listOrgTransfers() { return { transfers: [], personalTransferableMinor: null }; }
export async function transferOrgCredit() {}
export async function topupOrg() {}
export async function leaveOrg() {}
export async function dissolveOrg() {}
export async function removeOrgMember() {}
export async function transferOrgOwnership() {}
export async function decideJoinRequest() {}
export async function getInvitePreview() { return { orgName: "", requireApproval: true }; }
export async function listOrgAssets() { return []; }
export async function publishOrgAsset() { return {}; }
export async function revokeOrgAsset() {}
export async function grantOrgAsset() {}
export async function listOrgAssetGrants() { return []; }
export async function revokeOrgAssetGrant() {}
export function normalizeOrgUsage(v) { return v || { windowDays: 7, points: [], byModel: [] }; }
export function normalizeOrgAssetRows(v) { return Array.isArray(v) ? v : []; }
export function inviteUrlFor(code) { return "/join?code=" + (code || ""); }
export const ENTERPRISE_AGREEMENT_VERSION = "2026-09-20";
export const INVITE_LANDING_PATH = "/join";
export const ORG_ROLES = ["owner", "admin", "member"];
`;
