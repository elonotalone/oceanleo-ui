/**
 * 表格打开时，外壳的「恢复草稿」什么时候可以开始（`persistence.recovery.ready`）。
 *
 * 外壳恢复草稿时先异步读本机记录，读完要求编辑序号没动过，动了就报
 * 「最新服务器草稿暂时无法恢复，自动保存已暂停」。表格开着协同时，房间首同步会把
 * 上一次会话留在房间里、还没存成版本的格子套进画布（编辑序号 +1）——这一步如果
 * 落在外壳读记录的那几毫秒里，打开即报错、自动保存停住，房间里的改动永远存不进去，
 * 下次打开又是同样的报错（开发槽 R2 实测）。
 *
 * 所以：协同开着时，等首同步完成、绑定器已经把房间内容套进画布，再放恢复开始。
 */
export function gridRecoveryReady(input: {
  snapshotReady: boolean;
  loading: boolean;
  sourceFailed: boolean;
  collabOn: boolean;
  collabPhase: string;
  /** 绑定器已建好（建好时若房间已同步，首次套用已经同步完成）。 */
  collabBound: boolean;
}): boolean {
  if (!input.snapshotReady || input.loading || input.sourceFailed) return false;
  if (!input.collabOn) return true;
  return input.collabPhase === "live" && input.collabBound;
}
