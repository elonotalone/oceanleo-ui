import type { Locale } from "../../config";

// Project task modes (wave 2026-11-20 TM). Bind each translation to its
// source key; row order must never change its meaning.
const ZH = {
  "私有": "私有",
  "可查看": "可查看",
  "可协作": "可协作",
  "任务模式": "任务模式",
  "只有你能看到这个任务": "只有你能看到这个任务",
  "项目成员可以实时查看": "项目成员可以实时查看",
  "项目成员可以继续这个对话，费用由你承担": "项目成员可以继续这个对话，费用由你承担",
  "任务已设为「{mode}」": "任务已设为「{mode}」",
  "可协作暂不可用，请稍后再试。": "可协作暂不可用，请稍后再试。",
  "任务模式未能更改，请重试。": "任务模式未能更改，请重试。",
  "只有任务所有者可以更改模式": "只有任务所有者可以更改模式"
} as const;
type Copy = Record<keyof typeof ZH, string>;

const COPY: Record<Exclude<Locale, "zh">, Copy> = {
  "en": {
    "私有": "Private",
    "可查看": "Can view",
    "可协作": "Can collaborate",
    "任务模式": "Task mode",
    "只有你能看到这个任务": "Only you can see this task",
    "项目成员可以实时查看": "Project members can watch it live",
    "项目成员可以继续这个对话，费用由你承担": "Project members can continue this conversation; you pay for it",
    "任务已设为「{mode}」": "Task set to “{mode}”",
    "可协作暂不可用，请稍后再试。": "Can collaborate is not available yet. Try again later.",
    "任务模式未能更改，请重试。": "The task mode could not be changed. Try again.",
    "只有任务所有者可以更改模式": "Only the task owner can change the mode"
  },
  "zh-TW": {
    "私有": "私有",
    "可查看": "可查看",
    "可协作": "可協作",
    "任务模式": "任務模式",
    "只有你能看到这个任务": "只有你能看到這個任務",
    "项目成员可以实时查看": "專案成員可以即時查看",
    "项目成员可以继续这个对话，费用由你承担": "專案成員可以繼續這個對話，費用由你承擔",
    "任务已设为「{mode}」": "任務已設為「{mode}」",
    "可协作暂不可用，请稍后再试。": "可協作暫不可用，請稍後再試。",
    "任务模式未能更改，请重试。": "任務模式未能變更，請重試。",
    "只有任务所有者可以更改模式": "只有任務擁有者可以變更模式"
  },
  "de": {
    "私有": "Privat",
    "可查看": "Ansehen",
    "可协作": "Mitarbeiten",
    "任务模式": "Aufgabenmodus",
    "只有你能看到这个任务": "Nur du siehst diese Aufgabe",
    "项目成员可以实时查看": "Projektmitglieder können live zusehen",
    "项目成员可以继续这个对话，费用由你承担": "Projektmitglieder können dieses Gespräch fortsetzen; die Kosten trägst du",
    "任务已设为「{mode}」": "Aufgabe auf „{mode}“ gesetzt",
    "可协作暂不可用，请稍后再试。": "Mitarbeiten ist noch nicht verfügbar. Versuche es später erneut.",
    "任务模式未能更改，请重试。": "Der Aufgabenmodus konnte nicht geändert werden. Versuche es erneut.",
    "只有任务所有者可以更改模式": "Nur der Eigentümer der Aufgabe kann den Modus ändern"
  },
  "es": {
    "私有": "Privada",
    "可查看": "Puede ver",
    "可协作": "Puede colaborar",
    "任务模式": "Modo de la tarea",
    "只有你能看到这个任务": "Solo tú puedes ver esta tarea",
    "项目成员可以实时查看": "Los miembros del proyecto pueden verla en directo",
    "项目成员可以继续这个对话，费用由你承担": "Los miembros del proyecto pueden continuar esta conversación; tú pagas el coste",
    "任务已设为「{mode}」": "Tarea establecida en «{mode}»",
    "可协作暂不可用，请稍后再试。": "Puede colaborar aún no está disponible. Inténtalo más tarde.",
    "任务模式未能更改，请重试。": "No se pudo cambiar el modo de la tarea. Inténtalo de nuevo.",
    "只有任务所有者可以更改模式": "Solo el propietario de la tarea puede cambiar el modo"
  },
  "es-419": {
    "私有": "Privada",
    "可查看": "Puede ver",
    "可协作": "Puede colaborar",
    "任务模式": "Modo de la tarea",
    "只有你能看到这个任务": "Solo tú puedes ver esta tarea",
    "项目成员可以实时查看": "Los miembros del proyecto pueden verla en directo",
    "项目成员可以继续这个对话，费用由你承担": "Los miembros del proyecto pueden continuar esta conversación; tú pagas el coste",
    "任务已设为「{mode}」": "Tarea establecida en «{mode}»",
    "可协作暂不可用，请稍后再试。": "Puede colaborar aún no está disponible. Inténtalo más tarde.",
    "任务模式未能更改，请重试。": "No se pudo cambiar el modo de la tarea. Inténtalo de nuevo.",
    "只有任务所有者可以更改模式": "Solo el propietario de la tarea puede cambiar el modo"
  },
  "fr": {
    "私有": "Privée",
    "可查看": "Peut voir",
    "可协作": "Peut collaborer",
    "任务模式": "Mode de la tâche",
    "只有你能看到这个任务": "Vous seul voyez cette tâche",
    "项目成员可以实时查看": "Les membres du projet peuvent la suivre en direct",
    "项目成员可以继续这个对话，费用由你承担": "Les membres du projet peuvent poursuivre cette conversation ; vous en payez le coût",
    "任务已设为「{mode}」": "Tâche définie sur « {mode} »",
    "可协作暂不可用，请稍后再试。": "Peut collaborer n’est pas encore disponible. Réessayez plus tard.",
    "任务模式未能更改，请重试。": "Le mode de la tâche n’a pas pu être modifié. Réessayez.",
    "只有任务所有者可以更改模式": "Seul le propriétaire de la tâche peut changer le mode"
  },
  "it": {
    "私有": "Privata",
    "可查看": "Può vedere",
    "可协作": "Può collaborare",
    "任务模式": "Modalità attività",
    "只有你能看到这个任务": "Solo tu puoi vedere questa attività",
    "项目成员可以实时查看": "I membri del progetto possono seguirla in diretta",
    "项目成员可以继续这个对话，费用由你承担": "I membri del progetto possono continuare questa conversazione; il costo è a tuo carico",
    "任务已设为「{mode}」": "Attività impostata su «{mode}»",
    "可协作暂不可用，请稍后再试。": "Può collaborare non è ancora disponibile. Riprova più tardi.",
    "任务模式未能更改，请重试。": "Impossibile cambiare la modalità dell’attività. Riprova.",
    "只有任务所有者可以更改模式": "Solo il proprietario dell’attività può cambiare la modalità"
  },
  "pt-BR": {
    "私有": "Privada",
    "可查看": "Pode ver",
    "可协作": "Pode colaborar",
    "任务模式": "Modo da tarefa",
    "只有你能看到这个任务": "Só você pode ver esta tarefa",
    "项目成员可以实时查看": "Membros do projeto podem acompanhar ao vivo",
    "项目成员可以继续这个对话，费用由你承担": "Membros do projeto podem continuar esta conversa; você paga o custo",
    "任务已设为「{mode}」": "Tarefa definida como “{mode}”",
    "可协作暂不可用，请稍后再试。": "Pode colaborar ainda não está disponível. Tente mais tarde.",
    "任务模式未能更改，请重试。": "Não foi possível alterar o modo da tarefa. Tente novamente.",
    "只有任务所有者可以更改模式": "Só o dono da tarefa pode alterar o modo"
  },
  "pt-PT": {
    "私有": "Privada",
    "可查看": "Pode ver",
    "可协作": "Pode colaborar",
    "任务模式": "Modo da tarefa",
    "只有你能看到这个任务": "Só tu podes ver esta tarefa",
    "项目成员可以实时查看": "Os membros do projeto podem acompanhar em direto",
    "项目成员可以继续这个对话，费用由你承担": "Os membros do projeto podem continuar esta conversa; o custo é teu",
    "任务已设为「{mode}」": "Tarefa definida como «{mode}»",
    "可协作暂不可用，请稍后再试。": "Pode colaborar ainda não está disponível. Tenta mais tarde.",
    "任务模式未能更改，请重试。": "Não foi possível alterar o modo da tarefa. Tenta novamente.",
    "只有任务所有者可以更改模式": "Só o proprietário da tarefa pode alterar o modo"
  },
  "vi": {
    "私有": "Riêng tư",
    "可查看": "Có thể xem",
    "可协作": "Có thể cộng tác",
    "任务模式": "Chế độ tác vụ",
    "只有你能看到这个任务": "Chỉ bạn thấy tác vụ này",
    "项目成员可以实时查看": "Thành viên dự án có thể xem trực tiếp",
    "项目成员可以继续这个对话，费用由你承担": "Thành viên dự án có thể tiếp tục cuộc trò chuyện này; bạn trả chi phí",
    "任务已设为「{mode}」": "Đã đặt tác vụ thành “{mode}”",
    "可协作暂不可用，请稍后再试。": "Có thể cộng tác chưa khả dụng. Hãy thử lại sau.",
    "任务模式未能更改，请重试。": "Không thể đổi chế độ tác vụ. Hãy thử lại.",
    "只有任务所有者可以更改模式": "Chỉ chủ sở hữu tác vụ mới có thể đổi chế độ"
  },
  "tr": {
    "私有": "Özel",
    "可查看": "Görüntüleyebilir",
    "可协作": "Birlikte çalışabilir",
    "任务模式": "Görev modu",
    "只有你能看到这个任务": "Bu görevi yalnızca sen görebilirsin",
    "项目成员可以实时查看": "Proje üyeleri canlı izleyebilir",
    "项目成员可以继续这个对话，费用由你承担": "Proje üyeleri bu konuşmayı sürdürebilir; ücreti sen ödersin",
    "任务已设为「{mode}」": "Görev “{mode}” olarak ayarlandı",
    "可协作暂不可用，请稍后再试。": "Birlikte çalışabilir henüz kullanılamıyor. Daha sonra yeniden dene.",
    "任务模式未能更改，请重试。": "Görev modu değiştirilemedi. Yeniden dene.",
    "只有任务所有者可以更改模式": "Modu yalnızca görevin sahibi değiştirebilir"
  },
  "ja": {
    "私有": "非公開",
    "可查看": "閲覧可",
    "可协作": "共同作業可",
    "任务模式": "タスクのモード",
    "只有你能看到这个任务": "このタスクはあなただけが見られます",
    "项目成员可以实时查看": "プロジェクトのメンバーがリアルタイムで閲覧できます",
    "项目成员可以继续这个对话，费用由你承担": "プロジェクトのメンバーがこの会話を続けられます。費用はあなたの負担です",
    "任务已设为「{mode}」": "タスクを「{mode}」にしました",
    "可协作暂不可用，请稍后再试。": "共同作業可はまだ利用できません。しばらくしてからもう一度お試しください。",
    "任务模式未能更改，请重试。": "タスクのモードを変更できませんでした。もう一度お試しください。",
    "只有任务所有者可以更改模式": "モードを変更できるのはタスクの所有者だけです"
  },
  "ko": {
    "私有": "비공개",
    "可查看": "보기 가능",
    "可协作": "협업 가능",
    "任务模式": "작업 모드",
    "只有你能看到这个任务": "이 작업은 나만 볼 수 있습니다",
    "项目成员可以实时查看": "프로젝트 멤버가 실시간으로 볼 수 있습니다",
    "项目成员可以继续这个对话，费用由你承担": "프로젝트 멤버가 이 대화를 이어갈 수 있으며 비용은 내가 부담합니다",
    "任务已设为「{mode}」": "작업을 “{mode}”(으)로 설정했습니다",
    "可协作暂不可用，请稍后再试。": "협업 가능은 아직 사용할 수 없습니다. 나중에 다시 시도하세요.",
    "任务模式未能更改，请重试。": "작업 모드를 변경하지 못했습니다. 다시 시도하세요.",
    "只有任务所有者可以更改模式": "작업 소유자만 모드를 변경할 수 있습니다"
  },
  "ar": {
    "私有": "خاصة",
    "可查看": "يمكنهم العرض",
    "可协作": "يمكنهم التعاون",
    "任务模式": "وضع المهمة",
    "只有你能看到这个任务": "أنت وحدك ترى هذه المهمة",
    "项目成员可以实时查看": "يمكن لأعضاء المشروع متابعتها مباشرة",
    "项目成员可以继续这个对话，费用由你承担": "يمكن لأعضاء المشروع متابعة هذه المحادثة، وأنت تدفع التكلفة",
    "任务已设为「{mode}」": "تم ضبط المهمة على «{mode}»",
    "可协作暂不可用，请稍后再试。": "خيار يمكنهم التعاون غير متاح بعد. حاول لاحقًا.",
    "任务模式未能更改，请重试。": "تعذّر تغيير وضع المهمة. حاول مرة أخرى.",
    "只有任务所有者可以更改模式": "مالك المهمة وحده يمكنه تغيير الوضع"
  },
  "th": {
    "私有": "ส่วนตัว",
    "可查看": "ดูได้",
    "可协作": "ทำงานร่วมกันได้",
    "任务模式": "โหมดงาน",
    "只有你能看到这个任务": "มีเพียงคุณที่เห็นงานนี้",
    "项目成员可以实时查看": "สมาชิกโปรเจกต์ดูแบบสดได้",
    "项目成员可以继续这个对话，费用由你承担": "สมาชิกโปรเจกต์คุยต่อในบทสนทนานี้ได้ โดยคุณเป็นผู้จ่ายค่าใช้จ่าย",
    "任务已设为「{mode}」": "ตั้งงานเป็น “{mode}” แล้ว",
    "可协作暂不可用，请稍后再试。": "ทำงานร่วมกันได้ยังใช้ไม่ได้ ลองอีกครั้งภายหลัง",
    "任务模式未能更改，请重试。": "เปลี่ยนโหมดงานไม่สำเร็จ ลองอีกครั้ง",
    "只有任务所有者可以更改模式": "มีเพียงเจ้าของงานที่เปลี่ยนโหมดได้"
  },
  "hi": {
    "私有": "निजी",
    "可查看": "देख सकते हैं",
    "可协作": "साथ काम कर सकते हैं",
    "任务模式": "टास्क मोड",
    "只有你能看到这个任务": "यह टास्क केवल आप देख सकते हैं",
    "项目成员可以实时查看": "प्रोजेक्ट के सदस्य इसे लाइव देख सकते हैं",
    "项目成员可以继续这个对话，费用由你承担": "प्रोजेक्ट के सदस्य यह बातचीत जारी रख सकते हैं; खर्च आप उठाते हैं",
    "任务已设为「{mode}」": "टास्क “{mode}” पर सेट किया गया",
    "可协作暂不可用，请稍后再试。": "साथ काम कर सकते हैं अभी उपलब्ध नहीं है। बाद में फिर कोशिश करें।",
    "任务模式未能更改，请重试。": "टास्क मोड नहीं बदला जा सका। फिर कोशिश करें।",
    "只有任务所有者可以更改模式": "मोड केवल टास्क का मालिक बदल सकता है"
  }
};

export function rwTmCopy(locale: Locale): Record<string, string> {
  return locale === "zh" ? { ...ZH } : { ...COPY[locale] };
}
