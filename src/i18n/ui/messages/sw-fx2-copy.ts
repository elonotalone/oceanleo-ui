import type { Locale } from "../../config";

const COPY: Record<Locale, string> = {
  "en": "People are unavailable right now. Retrying automatically.",
  "zh": "找人功能暂不可用，正在自动恢复。",
  "zh-TW": "找人功能暫時無法使用，正在自動恢復。",
  "de": "Personen sind derzeit nicht verfügbar. Es wird automatisch erneut versucht.",
  "es": "Las personas no están disponibles ahora. Se reintentará automáticamente.",
  "es-419": "Las personas no están disponibles ahora. Se reintentará automáticamente.",
  "fr": "Les personnes sont indisponibles pour le moment. Nouvelle tentative automatique.",
  "it": "Le persone non sono disponibili al momento. Nuovo tentativo automatico.",
  "pt-BR": "As pessoas estão indisponíveis no momento. Uma nova tentativa será feita automaticamente.",
  "pt-PT": "As pessoas estão indisponíveis de momento. Será feita uma nova tentativa automaticamente.",
  "vi": "Tính năng tìm người tạm thời không khả dụng. Đang tự động thử lại.",
  "ja": "ユーザー情報は一時的に利用できません。自動で再試行しています。",
  "ko": "사용자 정보를 일시적으로 사용할 수 없습니다. 자동으로 다시 시도합니다.",
  "tr": "Kişiler şu anda kullanılamıyor. Otomatik olarak yeniden deneniyor.",
  "ar": "بيانات الأشخاص غير متاحة حاليًا. تتم إعادة المحاولة تلقائيًا.",
  "hi": "लोगों को खोजने की सुविधा अभी उपलब्ध नहीं है। अपने आप फिर कोशिश की जा रही है।",
  "th": "การค้นหาผู้คนไม่พร้อมใช้งานชั่วคราว กำลังลองใหม่โดยอัตโนมัติ"
};

export function swFx2Copy(locale: Locale): Record<string, string> {
  return { "找人功能暂不可用，正在自动恢复。": COPY[locale] };
}
