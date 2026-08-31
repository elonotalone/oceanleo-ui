// agent 抽屉的 id 只此一个常量。
// 单独成文件是为了让 SelectionToolbar（edit bar 上的 AI 按钮）和
// InlineAdvancedWorkbenchShell（抽屉内容的提供方）共用同一个字面量，
// 又不至于让 edit bar 反向依赖整个工作台外壳。
export const PLUGIN_AGENT_DRAWER_ID = "agent";
