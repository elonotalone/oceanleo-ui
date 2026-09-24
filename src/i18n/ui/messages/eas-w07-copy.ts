// 2026-09-24 editors-and-shell 波 W07 的分表。只由 W07 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W07_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "撤销「{name}」？": "撤销「{name}」？",
  "{n} 台在线": "{n} 台在线",
  "{name}现在离线，需要它执行的步骤会排队等它上线": "{name}现在离线，需要它执行的步骤会排队等它上线",
  "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。",
} as const;

export const EAS_W07_MESSAGES = assembleCopy(SOURCE, {
  en: {
    "撤销「{name}」？": "Revoke “{name}”?",
    "{n} 台在线": "{n} online",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} is offline. Steps that need it will wait in the queue until it comes back online.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} is online, but it hasn't allowed the cloud to send it tasks yet. That switch can only be turned on on that computer (in the tray icon).",
  },
  de: {
    "撤销「{name}」？": "„{name}“ widerrufen?",
    "{n} 台在线": "{n} online",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} ist offline. Schritte, die es brauchen, warten in der Warteschlange, bis es wieder online ist.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} ist online, hat der Cloud aber noch nicht erlaubt, Aufgaben zu senden. Dieser Schalter lässt sich nur an diesem Computer einschalten (im Tray-Symbol).",
  },
  es: {
    "撤销「{name}」？": "¿Revocar «{name}»?",
    "{n} 台在线": "{n} en línea",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} está desconectado. Los pasos que lo necesiten esperarán en la cola hasta que vuelva a estar en línea.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} está en línea, pero aún no ha permitido que la nube le envíe tareas. Ese interruptor solo se puede activar en ese ordenador (en el icono de la bandeja).",
  },
  "es-419": {
    "撤销「{name}」？": "¿Revocar «{name}»?",
    "{n} 台在线": "{n} en línea",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} está desconectada. Los pasos que la necesiten esperarán en la cola hasta que vuelva a estar en línea.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} está en línea, pero todavía no permitió que la nube le envíe tareas. Ese interruptor solo se puede prender en esa computadora (en el icono de la bandeja).",
  },
  fr: {
    "撤销「{name}」？": "Révoquer « {name} » ?",
    "{n} 台在线": "{n} en ligne",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} est hors ligne. Les étapes qui en ont besoin attendront dans la file jusqu’à son retour.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} est en ligne, mais n’a pas encore autorisé le cloud à lui envoyer des tâches. Cet interrupteur ne peut être activé que sur cet ordinateur (dans l’icône de la barre d’état).",
  },
  it: {
    "撤销「{name}」？": "Revocare «{name}»?",
    "{n} 台在线": "{n} online",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} è offline. I passaggi che lo richiedono resteranno in coda finché non torna online.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} è online, ma non ha ancora permesso al cloud di inviargli attività. Quell’interruttore si può accendere solo su quel computer (nell’icona della barra).",
  },
  "pt-BR": {
    "撤销「{name}」？": "Revogar “{name}”?",
    "{n} 台在线": "{n} online",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} está offline. As etapas que precisam dele vão esperar na fila até ele voltar.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} está online, mas ainda não permitiu que a nuvem envie tarefas. Esse interruptor só pode ser ligado nesse computador (no ícone da bandeja).",
  },
  "pt-PT": {
    "撤销「{name}」？": "Revogar “{name}”?",
    "{n} 台在线": "{n} online",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} está offline. Os passos que precisam dele vão esperar na fila até regressar.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} está online, mas ainda não permitiu que a nuvem lhe envie tarefas. Esse interruptor só pode ser ligado nesse computador (no ícone do tabuleiro).",
  },
  vi: {
    "撤销「{name}」？": "Thu hồi “{name}”?",
    "{n} 台在线": "{n} máy trực tuyến",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} đang ngoại tuyến. Các bước cần máy này sẽ xếp hàng đợi đến khi nó trở lại.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} đang trực tuyến nhưng chưa cho phép đám mây gửi nhiệm vụ. Công tắc đó chỉ bật được trên chính máy đó (trong biểu tượng khay).",
  },
  tr: {
    "撤销「{name}」？": "“{name}” iptal edilsin mi?",
    "{n} 台在线": "{n} çevrimiçi",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} çevrimdışı. Ona ihtiyaç duyan adımlar, tekrar çevrimiçi olana kadar kuyrukta bekler.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} çevrimiçi, ancak bulutun görev göndermesine henüz izin vermedi. Bu anahtar yalnızca o bilgisayarda açılabilir (tepsi simgesinde).",
  },
  "zh-TW": {
    "撤销「{name}」？": "撤銷「{name}」？",
    "{n} 台在线": "{n} 台在線",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name}現在離線，需要它執行的步驟會排隊等它上線",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name}在線，但它還沒允許雲端下發任務。這個開關只能在那台電腦上打開（系統匣圖示裡）。",
  },
  ja: {
    "撤销「{name}」？": "「{name}」を取り消しますか？",
    "{n} 台在线": "{n} 台がオンライン",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name}はオフラインです。この機器が必要な手順は、オンラインに戻るまでキューで待ちます。",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name}はオンラインですが、クラウドからのタスク送信をまだ許可していません。そのスイッチはそのパソコン上（トレイアイコン）でしかオンにできません。",
  },
  ko: {
    "撤销「{name}」？": "“{name}”을(를) 취소할까요?",
    "{n} 台在线": "{n}대 온라인",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name}이(가) 오프라인입니다. 이 기기가 필요한 단계는 다시 온라인 상태가 될 때까지 대기합니다.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name}은(는) 온라인이지만 아직 클라우드에서 작업을 보내는 것을 허용하지 않았습니다. 그 스위치는 해당 컴퓨터에서만 켤 수 있습니다(트레이 아이콘).",
  },
  ar: {
    "撤销「{name}」？": "هل تريد إلغاء «{name}»؟",
    "{n} 台在线": "{n} متصل",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} غير متصل. الخطوات التي تحتاجه ستنتظر في الطابور حتى يعود.",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} متصل، لكنه لم يسمح بعد للسحابة بإرسال المهام. لا يمكن تشغيل هذا المفتاح إلا على ذلك الحاسوب (في أيقونة الشريط).",
  },
  th: {
    "撤销「{name}」？": "เพิกถอน «{name}»?",
    "{n} 台在线": "ออนไลน์ {n} เครื่อง",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} ออฟไลน์อยู่ ขั้นตอนที่ต้องใช้เครื่องนี้จะเข้าคิวรอจนกว่าจะกลับมาออนไลน์",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} ออนไลน์แล้ว แต่ยังไม่อนุญาตให้คลาวด์ส่งงาน สวิตช์นั้นเปิดได้เฉพาะบนคอมพิวเตอร์เครื่องนั้น (ที่ไอคอนถาด)",
  },
  hi: {
    "撤销「{name}」？": "“{name}” रद्द करें?",
    "{n} 台在线": "{n} ऑनलाइन",
    "{name}现在离线，需要它执行的步骤会排队等它上线":
      "{name} ऑफ़लाइन है। जिन चरणों को इसकी ज़रूरत है वे वापस आने तक कतार में रहेंगे।",
    "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。":
      "{name} ऑनलाइन है, लेकिन अभी क्लाउड को काम भेजने की अनुमति नहीं दी है। वह स्विच उसी कंप्यूटर पर ही चालू हो सकता है (ट्रे आइकन में)।",
  },
});
