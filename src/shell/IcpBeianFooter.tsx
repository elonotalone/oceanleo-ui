/**
 * 境内合规页脚 —— ICP 备案号 + 公安联网备案号。
 *
 * WHY 在共享包里：《互联网信息服务管理办法》要求已备案网站在**每一个页面**的显著
 * 位置标明备案号并链到工信部备案系统。境内是 36 个前门（门户 + 35 个子站），把这
 * 段复制 36 遍的必然结果是漏掉几个 —— 而漏标在备案抽查里是要求整改、拒不整改可
 * 关站的项，它挡的不是功能，是站本身能不能继续开着。所以它和 `EmbedChrome`、
 * `LeoAssistant` 一样，是每个站根布局都渲染一次的共享外壳件。
 *
 * WHY 用构建期环境变量而不是按请求 host 判断：按 host 生成会让根布局动态化，全站
 * 丢掉 RSC 预取。而且这样 `.com` 的构建产物逐字节不变 —— 变量没设 → 返回 null →
 * 海外页面上连一个空 div 都不会多。变量只在境内镜像的 Dockerfile 里设。
 *
 * 门户 `oceanleo` 仓自 2026-08-10 起有一份同形的本地组件
 * （`app/_components/icp-beian-footer.tsx`），本组件是它的共享包版本，两者渲染
 * 结果一致；门户改用本组件后那份本地副本即可删除。
 *
 * 公安备案号单独一个变量，因为它比 ICP 晚办：ICP 下来就能填，公安联网备案要在网站
 * 开通后 30 日内另外去办。没办下来就留空，只显示 ICP 那一行。
 */

const ICP = (process.env.NEXT_PUBLIC_OCEANLEO_ICP_BEIAN || "").trim();
// 形如 "粤公网安备 44030702001234号"，配套的记录 id 用于拼平台查询链接。
const POLICE = (process.env.NEXT_PUBLIC_OCEANLEO_POLICE_BEIAN || "").trim();
const POLICE_CODE = (
  process.env.NEXT_PUBLIC_OCEANLEO_POLICE_BEIAN_CODE || ""
).trim();

export function IcpBeianFooter() {
  if (!ICP) return null;
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-6 text-xs text-neutral-500 dark:text-neutral-400">
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noreferrer"
        className="hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        {ICP}
      </a>
      {POLICE ? (
        <a
          href={
            POLICE_CODE
              ? `https://beian.mps.gov.cn/#/query/webSearch?code=${encodeURIComponent(POLICE_CODE)}`
              : "https://beian.mps.gov.cn/"
          }
          target="_blank"
          rel="noreferrer"
          className="hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          {POLICE}
        </a>
      ) : null}
    </footer>
  );
}
