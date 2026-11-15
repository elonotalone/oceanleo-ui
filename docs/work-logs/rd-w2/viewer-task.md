# RD-W2 观看端单元任务书

身份：viewer。仅 /root/wt/RD-W2-oceanleo-ui，分支 wt/RD-W2；中文commit，不push，不改主检出，不开新分支。先bootstrap，读内核、operator-rulings最新Convergence wave 1 synced、oceanleo/parallel-rollout packs。

独占本worktree所有产品源码及相关tests（父进程负责总验证与集成，不与你重叠改动）。A3 Panel拆分：session controller（连接/鉴权/生命周期）、媒体模块（ARTC订阅/画面/首帧）、已有scheduler与quality collector复用。RemoteDesktopPanel.tsx<=300行，显示交互；无镜像state/ref对；不要只是重命名搬走巨组件，模块需责任清楚。
A4 scheduler统一终态回执计时与释放额度/手动交还。旧三代入队/completion/direct ack解析保留标deprecated；旧native没有新字段时保持原逻辑。

跨仓协议：gateway给publisher descriptor bool input_receipt_ack=true；native协商后在旧dc_ack及DC rd.input_ack加input_receipt_version:1；gateway的viewer state追加input_receipt_version:1（旧native不声明则不加）。新native DC {v:1,t:"rd.input_receipt",sid,seq,status,executed_at_ms}；WS {type:"input_receipt",session_id,seq,status,executed_at_ms}，seq>0，status executed|merged|rejected，Unix执行/终态决策毫秒。声明新版后，所有旧ack仅解析、不得计时/解锁；统一回执幂等且按确切seq确认，不能把merged/rejected算执行或使交还成功。重复多路交付不得双计数。新native每个输入终态都发，probe也是输入；需要保留probe链证明。旧native不声明能力保持当前行为。

首帧当前media 20秒timeout；原生owner负责修WorkerStopped(7) retry退避，需协商时序，使timeout前至少一次重试完成。请给父进程建议并增加首帧/重试预算测试。避免无证据大幅放宽timeout。

验证：io guard run-heavy typecheck/api:check/consumers:check；run-light相关测试；全量npm test由父进程唯一执行与/tmp/ui-baseline-fails.txt comm对照，你不要跑全量。受静态字符串约束的测试可合理迁移至新模块，不能删断言绕过功能。每30–60秒报告进度。完成中文≤200行报告 /tmp/RD-W2-viewer-report.md，含file:line、命令结果、未做；提交回传hash。父进程亲自复核。

## 验证路径补修（父进程集成裁定）
诊断全量发现同一相邻仓目录假设造成新失败与若干非浏览器跨仓测试被错误skip。仅允许tests/**补通用配对仓路径解析（优先同前缀RD-W2-oceanleo，兼容main位置），修复错误skip的URL/compileModule路径；保留全部业务断言和真实不存在仓库时的skip，不硬编码/root，不改产品源码，不扩大到无关测试行为。先列文件边界，与基线失败名对照相关测试真跑，中文追加commit并更新/tmp报告。父进程继续收集当前诊断全量，之后唯一最终全量以新hash运行。

## 验证异步边界补修（父进程集成裁定）
第二轮全量已完成，新增1项 ux-lu-library-sections.test.mjs 的 a dropped folder... 断言：动态import尚未触达mock上传入口时就检查数组。仅允许这个测试文件消除固定4次settle的竞争：等待真实mock上传边界deferred（有界失败），原目录名/相对路径/接口调用/section等断言全部保留，不增加固定sleep，不改业务源码、不跳过。先证实该文件及相关业务与基线字节一致、隔离/延迟条件下表现，再修测试同步并真跑、中文commit、更新报告。最终全量由本单元主代理按新hash重跑。
