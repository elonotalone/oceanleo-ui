# ============================================================================
# 视觉回归闸的运行器（W10）
# ----------------------------------------------------------------------------
# 为什么必须是容器，而不是宿主裸跑：
#
#   1. 字形。基线图里绝大多数像素是文字。宿主与容器的字体族、hinting、
#      subpixel 策略只要差一点，整套基线当场全红——而那种红不指向任何真实回归。
#   2. 补装路走死过两次（`W10.md` P0 有实测记录）：容器里缺 `libglib`，
#      `apt-get` 自己跑不起来（缺 `libapt-pkg.so.6.0`）；借宿主机的库会把宿主
#      glibc 拖进来炸 `__nptl_change_stack_perm`。所以浏览器只用官方镜像预装的。
#
# 版本刻意钉死在 1.61.0，与仓内既有 `playwright-core@1.61.0` 对齐。
# 两份 driver 漂移会让「同一份代码在两台机器上截出两张图」，那是基线的死因。
# 改这里的版本号 = 作废全部基线，必须同时更新 `docs/testing/visual-regression.md`。
# ============================================================================
FROM mcr.microsoft.com/playwright:v1.61.0-noble

# 官方镜像给了浏览器（/ms-playwright 下 chromium-1228 等），**没给** `@playwright/test`。
# 所以这里自己装，且装在 `/pw` —— 一个与被测仓完全无关的前缀。
#
# 为什么不装进 /work（挂载进来的工作树）：那会往宿主工作树写 node_modules，
# 而 W10 的红线是不脏别人的树。容器内装、容器内用，宿主一个字节都不动。
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /pw
RUN npm init -y >/dev/null 2>&1 \
 && npm install --no-audit --no-fund --loglevel=error @playwright/test@1.61.0 \
 && npm cache clean --force

# 这条软链是模块解析的全部机关，值得解释清楚。
#
# spec 在 /work/tests/visual/specs/*.spec.ts，config 在 /work/playwright.config.ts，
# 两者都 `import "@playwright/test"`。node 的解析是从文件所在目录**逐级向上**找
# node_modules：
#
#   /work/tests/visual/specs/node_modules → … → /work/node_modules → /node_modules
#
# 宿主的 /work/node_modules 里有 react / typescript / fabric（harness 要用，
# 必须能找到），但**没有** `@playwright/test`（它只在 package.json 里声明了、
# 还没 install）。于是解析自然穿过 /work/node_modules 落到 /node_modules 上。
#
# 结果：被测仓需要的包从宿主树取，runner 需要的包从镜像取，两边不互相污染，
# 也不需要匿名 volume 去遮挡任何路径。
RUN ln -s /pw/node_modules /node_modules

# 显式把 runner 的 bin 放进 PATH，这样 run.sh 可以直接 `playwright test`，
# 不必依赖 npx 的向上查找（npx 的解析顺序会随 cwd 变，不适合当门禁的入口）。
ENV PATH=/pw/node_modules/.bin:$PATH

# 被测仓的挂载点。run.sh 用 `-v <repo>:/work` 挂进来。
WORKDIR /work
