#!/usr/bin/env bash
# ============================================================================
# 视觉回归闸的唯一入口（W10）
# ----------------------------------------------------------------------------
# `package.json` 的 `test:visual` / `test:visual:update` 都指向这里。
#
# 它做的事只有一件：**保证这套用例永远在同一个容器里跑**。
# 宿主裸跑 `npx playwright test` 会用宿主字体截图，与基线逐字不同 ⇒ 整套红，
# 而那种红不指向任何真实回归。所以这个脚本刻意不提供「在宿主跑」的开关。
#
# 用法：
#   npm run test:visual                  # 判定（基线必须已存在）
#   npm run test:visual:update           # 定/更新基线（谁有权更新见运行手册）
#   npm run test:visual -- --grep w04    # 透传任何 playwright 参数
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${HERE}/../../.." && pwd)"

# 与 Dockerfile 的 FROM 逐字一致。两处不一致 = 基线在不同 driver 上生成 = 基线报废。
BASE_IMAGE="mcr.microsoft.com/playwright:v1.61.0-noble"
IMAGE="${LEO_VISUAL_IMAGE:-leo-visual-runner:1.61.0}"
HARNESS_PORT="${LEO_HARNESS_PORT:-4319}"

# 递归自杀防护：容器里 `playwright test` 直接跑用例，不该再回头调这个脚本。
if [[ "${LEO_VISUAL_IN_CONTAINER:-}" == "1" ]]; then
  echo "[leo-visual] 已经在容器里了；容器内应直接跑 \`playwright test\`。" >&2
  exit 2
fi

# `--update-snapshots` 同时意味着「允许写预算基线」。
# 两件事必须同一个开关：截图基线与延迟预算是同一次实测的两半，
# 分开授权会出现「图更新了、预算还是上个月的」这种半新半旧的基线。
budget_update=0
for arg in "$@"; do
  case "${arg}" in
    --update-snapshots | -u | --update-snapshots=*) budget_update=1 ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "[leo-visual] 找不到 docker。这道闸的基线必须在官方镜像里生成，理由见" >&2
  echo "[leo-visual]   docs/testing/visual-regression.md §为什么必须在容器里" >&2
  exit 3
fi

if ! docker version >/dev/null 2>&1; then
  echo "[leo-visual] docker 在 PATH 里但连不上 daemon。" >&2
  echo "[leo-visual] 若在 Cursor 子 agent 里跑，docker.sock 只在**非沙箱**下可见：" >&2
  echo "[leo-visual]   用 required_permissions: [\"all\"] 重跑（实测，2026-08-31）。" >&2
  exit 3
fi

# 基线镜像刻意**不自动 pull**：它 3.45GB，而这台机器上并发着十几个 agent，
# 一次静默拉取足以把磁盘 IO 压停（`_COMMON.md` §7 记过 2026-08-07 那次事故）。
# 要拉就由人显式拉。
if ! docker image inspect "${BASE_IMAGE}" >/dev/null 2>&1; then
  echo "[leo-visual] 本地没有基线镜像 ${BASE_IMAGE}。" >&2
  echo "[leo-visual] 显式拉一次（3.45GB，别在 IO 繁忙时做）：" >&2
  echo "[leo-visual]   docker pull ${BASE_IMAGE}" >&2
  exit 4
fi

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "[leo-visual] 首次运行：构建 runner 镜像 ${IMAGE}（装 @playwright/test，约 1 分钟）…"
  docker build --quiet --tag "${IMAGE}" --file "${HERE}/Dockerfile" "${HERE}" >/dev/null
  echo "[leo-visual] runner 镜像就绪。"
fi

docker_env=(
  --env "LEO_VISUAL_IN_CONTAINER=1"
  --env "LEO_HARNESS_PORT=${HARNESS_PORT}"
  # 容器内没有 tty 时 Playwright 的 list reporter 会退化成逐行输出，正合门禁所需。
  --env "CI=1"
)
if (( budget_update )); then
  docker_env+=(--env "LEO_BUDGET_UPDATE=1")
  echo "[leo-visual] 基线更新模式：截图基线与延迟预算都会被写盘。"
  echo "[leo-visual] 提醒：预算**只减不增**（tests/visual/helpers/budget.ts），"
  echo "[leo-visual]       实测比现有预算慢不会被静默放宽，会判红。"
fi

# ─── 资源上限：为什么这道闸自己给自己上铐 ───────────────────────────────────
# 这台机器上并发着十几个 agent，`free -h` 实测只剩 4 GiB available，而
# 「docker 跑 Playwright」是整波里最吃内存的一个动作。共享机器上的纪律
# （`agent-io-guard.sh run-heavy` 排队）**挡不住这一条**，原因实测于 2026-08-31：
# 未走 guard 的进程把 CPU 吃到 122%，guard 于是只肯发 1 of 4 个槽，队列积到 8 个，
# 一个 14 分钟都没被admit的 run-heavy 等于零进度——而它一旦被 admit，
# 又没有任何东西限制它实际用多少内存。
#
# 所以上限写在这里，用 cgroup 硬限而不是靠排队：
#   - 排队是「希望别人也守规矩」，硬限是「我物理上超不过」；
#   - 超了由内核在**容器内**杀掉 chromium（一条清楚的红），
#     而不是让宿主 OOM killer 去挑一个受害者——上一次挑中的是整台机器
#     （2026-08-14 / 08-20 两次硬冻结，见 `docs/runbooks/server-hang-recovery.md`）。
#
# 2 GiB 是实测够用的量：`workers:1`（playwright.config.ts 里刻意定的）意味着
# 同时只有一个 chromium，渲染的是静态夹具页，没有视频、没有多标签。
# 要调就显式调，别默默调大。
MEM_LIMIT="${LEO_VISUAL_MEMORY:-2g}"
MEM_SWAP="${LEO_VISUAL_MEMORY_SWAP:-3g}"
CPU_LIMIT="${LEO_VISUAL_CPUS:-2}"

# `--ipc=host` 是 Playwright 官方镜像的硬要求：默认的 64MB /dev/shm 会让
# chromium 在多标签下 OOM 崩溃，而崩溃表现为「随机某几张图截失败」——
# 最难查的一类假阳性。
#
# 注意它与上面的内存上限有一处相互作用，值得写明白免得后人以为哪个失效了：
# `--ipc=host` 让 /dev/shm 来自宿主，那部分不计进容器的 cgroup。
# 所以内存上限约束的是 chromium 的堆与渲染器，不是共享内存段。
# 这是刻意的取舍：把 shm 关回 64MB 会换来那类最难查的假阳性。
#
# 挂载是**读写**的，这是刻意的：基线图与预算 JSON 要落回工作树才能被提交。
# 容器不往工作树装任何依赖（runner 的包在镜像的 /pw 里，见 Dockerfile）。
echo "[leo-visual] 资源上限：memory=${MEM_LIMIT} swap=${MEM_SWAP} cpus=${CPU_LIMIT}（改用 LEO_VISUAL_MEMORY / _SWAP / _CPUS）"

exec docker run --rm \
  --ipc=host \
  --memory "${MEM_LIMIT}" \
  --memory-swap "${MEM_SWAP}" \
  --cpus "${CPU_LIMIT}" \
  --volume "${REPO}:/work" \
  --workdir /work \
  "${docker_env[@]}" \
  "${IMAGE}" \
  playwright test "$@"
