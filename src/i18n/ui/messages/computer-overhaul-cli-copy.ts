// 2026-10-14 分身电脑页整改 · AI 命令行卡。本表只归一个工作单元；注册已由父 agent 在 shell-overhaul-copy.ts 完成。
// 约定同 acp-card-copy.ts：SOURCE 放全站词典里还没有的中文键；每个语种给全同名表，缺键 tsc 编不过。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = { "过去的对话读取失败，请重试。": "过去的对话读取失败，请重试。" } as const;

export const COMPUTER_OVERHAUL_CLI_MESSAGES = assembleCopy(SOURCE, {
  en: { "过去的对话读取失败，请重试。": "Could not load previous conversations. Try again." },
  de: { "过去的对话读取失败，请重试。": "Frühere Gespräche konnten nicht geladen werden. Bitte erneut versuchen." },
  es: { "过去的对话读取失败，请重试。": "No se pudieron cargar las conversaciones anteriores. Inténtalo de nuevo." },
  "es-419": { "过去的对话读取失败，请重试。": "No se pudieron cargar las conversaciones anteriores. Inténtalo de nuevo." },
  fr: { "过去的对话读取失败，请重试。": "Impossible de charger les conversations précédentes. Réessayez." },
  it: { "过去的对话读取失败，请重试。": "Impossibile caricare le conversazioni precedenti. Riprova." },
  "pt-BR": { "过去的对话读取失败，请重试。": "Não foi possível carregar as conversas anteriores. Tente novamente." },
  "pt-PT": { "过去的对话读取失败，请重试。": "Não foi possível carregar as conversas anteriores. Tente novamente." },
  vi: { "过去的对话读取失败，请重试。": "Không thể tải các cuộc trò chuyện trước. Vui lòng thử lại." },
  tr: { "过去的对话读取失败，请重试。": "Önceki konuşmalar yüklenemedi. Tekrar deneyin." },
  "zh-TW": { "过去的对话读取失败，请重试。": "過去的對話讀取失敗，請重試。" },
  ja: { "过去的对话读取失败，请重试。": "過去の会話を読み込めませんでした。再試行してください。" },
  ko: { "过去的对话读取失败，请重试。": "이전 대화를 불러오지 못했습니다. 다시 시도하세요." },
  ar: { "过去的对话读取失败，请重试。": "تعذر تحميل المحادثات السابقة. حاول مرة أخرى." },
  th: { "过去的对话读取失败，请重试。": "โหลดการสนทนาก่อนหน้าไม่สำเร็จ โปรดลองอีกครั้ง" },
  hi: { "过去的对话读取失败，请重试。": "पिछली बातचीत लोड नहीं हो सकी। फिर से कोशिश करें।" },
});
