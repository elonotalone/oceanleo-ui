// 2026-09-24 editors-and-shell 波 W16 的分表。只由 W16 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W16_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  组件栈: "组件栈",
  编辑器还在加载: "编辑器还在加载",
} as const;

export const EAS_W16_MESSAGES = assembleCopy(SOURCE, {
  en: { 组件栈: "Component stack", 编辑器还在加载: "Editor is still loading" },
  de: {
    组件栈: "Komponentenstapel",
    编辑器还在加载: "Editor wird noch geladen",
  },
  es: {
    组件栈: "Pila de componentes",
    编辑器还在加载: "El editor todavía se está cargando",
  },
  "es-419": {
    组件栈: "Pila de componentes",
    编辑器还在加载: "El editor todavía se está cargando",
  },
  fr: {
    组件栈: "Pile de composants",
    编辑器还在加载: "L’éditeur est encore en cours de chargement",
  },
  it: {
    组件栈: "Stack dei componenti",
    编辑器还在加载: "L’editor è ancora in caricamento",
  },
  "pt-BR": {
    组件栈: "Pilha de componentes",
    编辑器还在加载: "O editor ainda está carregando",
  },
  "pt-PT": {
    组件栈: "Pilha de componentes",
    编辑器还在加载: "O editor ainda está a carregar",
  },
  vi: {
    组件栈: "Ngăn xếp thành phần",
    编辑器还在加载: "Trình soạn thảo vẫn đang tải",
  },
  tr: {
    组件栈: "Bileşen yığını",
    编辑器还在加载: "Düzenleyici hâlâ yükleniyor",
  },
  "zh-TW": { 组件栈: "元件堆疊", 编辑器还在加载: "編輯器還在載入" },
  ja: {
    组件栈: "コンポーネントスタック",
    编辑器还在加载: "エディターを読み込み中",
  },
  ko: { 组件栈: "컴포넌트 스택", 编辑器还在加载: "편집기를 아직 불러오는 중" },
  ar: { 组件栈: "مكدس المكوّنات", 编辑器还在加载: "المحرر ما زال قيد التحميل" },
  th: { 组件栈: "สแต็กคอมโพเนนต์", 编辑器还在加载: "ตัวแก้ไขยังกำลังโหลด" },
  hi: {
    组件栈: "कंपोनेंट स्टैक",
    编辑器还在加载: "संपादक अभी भी लोड हो रहा है",
  },
});
