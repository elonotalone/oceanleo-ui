// ============================================================================
// @oceanleo/ui — EmbedChrome：工作台 iframe 内嵌「外壳闪屏」的 pre-paint 杀手
// ----------------------------------------------------------------------------
// 详见 docs/architecture/oceanleo-embed-prepaint-chrome-hide.md。
//
// 背景：主站 oceanleo.com/workspace 用 <iframe src="<子站>/workspace?embed=1&solo=1">
// 内嵌子站功能区。子站的 AppShell 外壳（侧栏/顶栏/浮动键/Leo 助手）在 SSR 首屏
// HTML 里就存在 —— 浏览器先把这份整壳画一帧、React hydrate 后才摘掉 = 肉眼可见
// 的「先闪整壳再跳裸视图」。任何「客户端惰性 state（useIsEmbed）」都修不掉
// **服务端已经吐出来的那一帧 HTML**。
//
// 正确解（本组件）：在首帧绘制**之前**就用 CSS 把外壳藏掉。CSS 读不到 URL query，
// 所以用一段**内联同步 <script>** 把 ?embed=1 / ?solo=1 写成
// <html data-embed="1" data-solo="1">，再配一段内联 <style> 规则把带
// data-oceanleo-shell / data-oceanleo-chrome / data-ai-assistant-root 的外壳节点
// display:none。script 在 <head>/body 顶部同步执行，先于首帧 → 不闪。React 该
// 怎么渲染还怎么渲染（useIsEmbed 仍会在 hydrate 后把外壳真正从 DOM 摘掉），CSS
// 只是「先盖住那一帧」，不改组件行为、不引入可见的 hydration 跳变。
//
// 这是**纯服务端组件**（无 "use client"）：它必须把 script+style 直接写进 SSR
// HTML 才能先于首帧生效。各站只需在 root layout 的 <body> 顶部放一次 <EmbedChrome/>。
// ============================================================================

// 同步执行：first paint 前把 embed/solo 写到 <html> 的 data- 属性上。
// 用 try/catch 包死，任何异常都不能阻塞页面。幂等：可被多次注入而无副作用。
const PREPAINT_SCRIPT = `(function(){try{var p=new URLSearchParams(location.search);var d=document.documentElement;if(p.get("embed")==="1")d.setAttribute("data-embed","1");if(p.get("solo")==="1")d.setAttribute("data-solo","1");}catch(e){}})();`;

// embed 时：藏掉所有外壳 chrome（侧栏/顶栏/浮动键/移动抽屉/Leo 助手），并清掉
// 主区为浮动键预留的左内边距，让内容贴边占满 iframe。
const PREPAINT_STYLE = `html[data-embed="1"] [data-oceanleo-chrome],html[data-embed="1"] [data-ai-assistant-root]{display:none!important}html[data-embed="1"] [data-oceanleo-shell]>div>main{padding-left:0!important}html[data-embed="1"],html[data-embed="1"] body{background:transparent!important}`;

/**
 * 在每站 root layout 的 <body> 顶部放一次：
 *
 *   <body>
 *     <EmbedChrome />
 *     {children}
 *     <LeoAssistant ... />
 *   </body>
 *
 * 纯服务端组件，零运行时依赖。
 */
export function EmbedChrome() {
  return (
    <>
      <style
        data-embed-prepaint
        dangerouslySetInnerHTML={{ __html: PREPAINT_STYLE }}
      />
      <script
        data-embed-prepaint
        dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }}
      />
    </>
  );
}
