// 「去建资料」和设置里「编辑主页」：先记下要进编辑，再打开「我的主页」。
// 模块级开关，不进地址栏：公开链接仍是看主页，不是编辑态。

let pendingEdit = false;

export function requestMinePageEdit(): void {
  pendingEdit = true;
}

export function takeMinePageEdit(): boolean {
  const value = pendingEdit;
  pendingEdit = false;
  return value;
}
