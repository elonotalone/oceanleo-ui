// 2026-09-24 editors-and-shell 波 W07 的分表。只由 W07 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W07_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "撤销「{name}」？": "撤销「{name}」？",
  "{n} 台在线": "{n} 台在线",
  "{name}现在离线，需要它执行的步骤会排队等它上线": "{name}现在离线，需要它执行的步骤会排队等它上线",

} as const;

export const EAS_W07_MESSAGES = assembleCopy(SOURCE, {
  en: {
    "撤销「{name}」？": "Revoke “{name}”?",
    "{n} 台在线": "{n} online",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} is offline. Steps that need it will wait in the queue until it comes back online.",

  },
  de: {
    "撤销「{name}」？": "„{name}“ widerrufen?",
    "{n} 台在线": "{n} online",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} ist offline. Schritte, die es brauchen, warten in der Warteschlange, bis es wieder online ist.",

  },
  es: {
    "撤销「{name}」？": "¿Revocar «{name}»?",
    "{n} 台在线": "{n} en línea",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} está desconectado. Los pasos que lo necesiten esperarán en la cola hasta que vuelva a estar en línea.",

  },
  "es-419": {
    "撤销「{name}」？": "¿Revocar «{name}»?",
    "{n} 台在线": "{n} en línea",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} está desconectada. Los pasos que la necesiten esperarán en la cola hasta que vuelva a estar en línea.",

  },
  fr: {
    "撤销「{name}」？": "Révoquer « {name} » ?",
    "{n} 台在线": "{n} en ligne",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} est hors ligne. Les étapes qui en ont besoin attendront dans la file jusqu’à son retour.",

  },
  it: {
    "撤销「{name}」？": "Revocare «{name}»?",
    "{n} 台在线": "{n} online",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} è offline. I passaggi che lo richiedono resteranno in coda finché non torna online.",

  },
  "pt-BR": {
    "撤销「{name}」？": "Revogar “{name}”?",
    "{n} 台在线": "{n} online",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} está offline. As etapas que precisam dele vão esperar na fila até ele voltar.",

  },
  "pt-PT": {
    "撤销「{name}」？": "Revogar “{name}”?",
    "{n} 台在线": "{n} online",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} está offline. Os passos que precisam dele vão esperar na fila até regressar.",

  },
  vi: {
    "撤销「{name}」？": "Thu hồi “{name}”?",
    "{n} 台在线": "{n} máy trực tuyến",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} đang ngoại tuyến. Các bước cần máy này sẽ xếp hàng đợi đến khi nó trở lại.",

  },
  tr: {
    "撤销「{name}」？": "“{name}” iptal edilsin mi?",
    "{n} 台在线": "{n} çevrimiçi",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} çevrimdışı. Ona ihtiyaç duyan adımlar, tekrar çevrimiçi olana kadar kuyrukta bekler.",

  },
  "zh-TW": {
    "撤销「{name}」？": "撤銷「{name}」？",
    "{n} 台在线": "{n} 台在線",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name}現在離線，需要它執行的步驟會排隊等它上線",

  },
  ja: {
    "撤销「{name}」？": "「{name}」を取り消しますか？",
    "{n} 台在线": "{n} 台がオンライン",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name}はオフラインです。この機器が必要な手順は、オンラインに戻るまでキューで待ちます。",

  },
  ko: {
    "撤销「{name}」？": "“{name}”을(를) 취소할까요?",
    "{n} 台在线": "{n}대 온라인",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name}이(가) 오프라인입니다. 이 기기가 필요한 단계는 다시 온라인 상태가 될 때까지 대기합니다.",

  },
  ar: {
    "撤销「{name}」？": "هل تريد إلغاء «{name}»؟",
    "{n} 台在线": "{n} متصل",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} غير متصل. الخطوات التي تحتاجه ستنتظر في الطابور حتى يعود.",

  },
  th: {
    "撤销「{name}」？": "เพิกถอน «{name}»?",
    "{n} 台在线": "ออนไลน์ {n} เครื่อง",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} ออฟไลน์อยู่ ขั้นตอนที่ต้องใช้เครื่องนี้จะเข้าคิวรอจนกว่าจะกลับมาออนไลน์",

  },
  hi: {
    "撤销「{name}」？": "“{name}” रद्द करें?",
    "{n} 台在线": "{n} ऑनलाइन",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} ऑफ़लाइन है। जिन चरणों को इसकी ज़रूरत है वे वापस आने तक कतार में रहेंगे।",

  },
});
