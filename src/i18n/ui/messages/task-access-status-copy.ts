import { LOCALES, type Locale } from "../../config";

const loading = "正在读取访问权限…";
const unstable = "网络不稳定，正在重试。";
const text: Record<Locale, readonly [string, string]> = {
  zh: [loading, unstable],
  "zh-TW": ["正在讀取存取權限…", "網路不穩定，正在重試。"],
  en: ["Loading access permissions…", "Network unstable, retrying."],
  de: ["Zugriffsrechte werden geladen…", "Netzwerk instabil. Erneuter Versuch läuft."],
  es: ["Cargando permisos de acceso…", "Red inestable. Reintentando."],
  "es-419": ["Cargando permisos de acceso…", "Red inestable. Reintentando."],
  fr: ["Chargement des autorisations d’accès…", "Réseau instable, nouvelle tentative en cours."],
  it: ["Caricamento dei permessi di accesso…", "Rete instabile, nuovo tentativo in corso."],
  "pt-BR": ["Carregando permissões de acesso…", "Rede instável, tentando novamente."],
  "pt-PT": ["A carregar permissões de acesso…", "Rede instável, a tentar novamente."],
  vi: ["Đang tải quyền truy cập…", "Mạng không ổn định, đang thử lại."],
  tr: ["Erişim izinleri yükleniyor…", "Ağ kararsız, yeniden deneniyor."],
  ja: ["アクセス権を読み込み中…", "ネットワークが不安定です。再試行しています。"],
  ko: ["액세스 권한을 불러오는 중…", "네트워크가 불안정합니다. 다시 시도 중입니다."],
  ar: ["جارٍ تحميل أذونات الوصول…", "الشبكة غير مستقرة، جارٍ إعادة المحاولة."],
  th: ["กำลังโหลดสิทธิ์การเข้าถึง…", "เครือข่ายไม่เสถียร กำลังลองอีกครั้ง"],
  hi: ["पहुँच अनुमतियाँ लोड हो रही हैं…", "नेटवर्क अस्थिर है, फिर से कोशिश की जा रही है।"],
};
export const TASK_ACCESS_STATUS_MESSAGES = Object.fromEntries<Record<string, string>>(LOCALES.map(locale => [locale, {
  [loading]: text[locale][0], [unstable]: text[locale][1],
}])) as Record<Locale, Record<string, string>>;
