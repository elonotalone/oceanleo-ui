// usePluginsCatalog 从 org-api 取组织 MCP 连接。只桩 listMyOrgs / getOrg
// 时，编译图一走进插件目录就会整文件加载失败。

export const ORG_MCP_STUB_SOURCE = `
export async function listInheritedMcp() { return []; }
export async function listOrgMcpConnections() { return []; }
export async function deleteOrgMcpConnection() {}
export async function patchOrgMcpConnection() { return null; }
export async function upsertOrgMcpConnection() { return null; }
export async function setOrgMcpForwardIdentity() {}
`;
