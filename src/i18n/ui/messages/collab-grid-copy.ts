// 2026-10-06 work-chat 第二轮 F10（表格结构变化多人同改）的分表。只由该 owner 改；注册在 work-chat-copy.ts（父改）。
// 写法同 collab-visual-copy.ts：SOURCE 里「名字 → 简体中文原文」，各语种给同名条目；键就是简体中文原文（`tt("中文原文", { n })`）。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  gridReloaded: "别人调整了表格的一部分设置，表格已重新载入。",
} as const;

export const COLLAB_GRID_MESSAGES = assembleCopy(SOURCE, {
  de: {
    gridReloaded: "Jemand hat Tabelleneinstellungen geändert – die Tabelle wurde neu geladen.",
  },
  en: {
    gridReloaded: "Someone changed some table settings, so the table was reloaded.",
  },
  es: {
    gridReloaded: "Alguien cambió algunos ajustes de la tabla, así que se volvió a cargar.",
  },
  "es-419": {
    gridReloaded: "Alguien cambió algunos ajustes de la tabla, por eso se volvió a cargar.",
  },
  fr: {
    gridReloaded: "Quelqu'un a modifié certains réglages du tableau ; le tableau a été rechargé.",
  },
  it: {
    gridReloaded: "Qualcuno ha modificato alcune impostazioni della tabella, quindi è stata ricaricata.",
  },
  "pt-BR": {
    gridReloaded: "Alguém alterou algumas configurações da planilha, então ela foi recarregada.",
  },
  "pt-PT": {
    gridReloaded: "Alguém alterou algumas definições da folha de cálculo, por isso foi recarregada.",
  },
  vi: {
    gridReloaded: "Có người đã thay đổi một số thiết lập của bảng tính nên bảng đã được tải lại.",
  },
  tr: {
    gridReloaded: "Biri tablonun bazı ayarlarını değiştirdi, bu yüzden tablo yeniden yüklendi.",
  },
  "zh-TW": {
    gridReloaded: "別人調整了表格的一部分設定，表格已重新載入。",
  },
  ja: {
    gridReloaded: "他の人が表の一部の設定を変更したため、表を読み込み直しました。",
  },
  ko: {
    gridReloaded: "다른 사람이 표의 일부 설정을 바꿔서 표를 다시 불러왔습니다.",
  },
  ar: {
    gridReloaded: "قام شخص ما بتغيير بعض إعدادات الجدول، لذلك أُعيد تحميل الجدول.",
  },
  th: {
    gridReloaded: "มีคนเปลี่ยนการตั้งค่าบางส่วนของตาราง ตารางจึงถูกโหลดใหม่",
  },
  hi: {
    gridReloaded: "किसी ने तालिका की कुछ सेटिंग बदली हैं, इसलिए तालिका दोबारा लोड की गई।",
  },
});
