// @oceanleo/ui — 工作台里那几句「说清刚才发生了什么」的文案词典（17 语）。
//
// 为什么这几条要单独成册、而不是丢进 `zh.ts`/`en.ts` 那样的平表：
//
// 平表的类型是 `Record<string, string>`，**少一个语种、少一条 key，编译器一声不响**。
// 这一册照 `plugin-chrome-copy-*` 的办法，把 16 个非中文语种钉进入参类型
// （`Record<Exclude<Locale, "zh">, WorkbenchOfficeCopyMessages>`），
// 于是少一个语种或少一条 key，`tsc --noEmit` 当场编不过——不靠人记得补。
//
// 这几条的共同点是**它们全都不是标签，而是一句回执**：用户点了「重新计算」
// 或要离开编辑器，屏幕上得有一句话说清后果。`useUI()` 未命中时回退中文原文
// （见 ../useUI.ts），所以缺译文既不崩也不报错，只是把中文印在外国用户脸上。
//
// ⚠️ `recalcDone` 带 `{cells}`／`{formulas}` 两个插值位。它**原来是五个中文片段
// 拼出来的**（`translate("已按新的计算时刻重算 ") + n + translate(" 个格子（全表共 ")`…），
// 那种写法在任何语序不同的语言里都拼不出通顺句子——片段各自翻译，合起来是坏的。
// 所以这里是一整句带占位符。改这一条时请保持两个占位符都在，别再拆回片段。

import { LOCALES, type Locale } from "../../config";

/** 中文原文即 key。语义名只用来让 17 张表按同一把尺子对齐。 */
export const WORKBENCH_OFFICE_COPY_SOURCE = {
  recalcNoFormulas: "这张工作簿里还没有公式，没有需要重算的格子。",
  recalcUnchanged:
    "这些公式的结果不随时间变（没有 TODAY / NOW / RAND 一类），重算后与原来相同。",
  recalcDone: "已按新的计算时刻重算 {cells} 个格子（全表共 {formulas} 条公式）。",
  leave: "离开",
};

export type WorkbenchOfficeCopyName = keyof typeof WORKBENCH_OFFICE_COPY_SOURCE;

export type WorkbenchOfficeCopyMessages = Record<WorkbenchOfficeCopyName, string>;

const WORKBENCH_OFFICE_TRANSLATIONS: Record<
  Exclude<Locale, "zh">,
  WorkbenchOfficeCopyMessages
> = {
  en: {
    recalcNoFormulas: "This workbook has no formulas yet, so there is nothing to recalculate.",
    recalcUnchanged:
      "These formulas don't change over time (no TODAY / NOW / RAND), so recalculating gives the same results.",
    recalcDone:
      "Recalculated {cells} cells at the new calculation time ({formulas} formulas in the workbook).",
    leave: "Leave",
  },
  de: {
    recalcNoFormulas:
      "Diese Arbeitsmappe enthält noch keine Formeln, es gibt also nichts neu zu berechnen.",
    recalcUnchanged:
      "Diese Formeln ändern sich nicht mit der Zeit (kein TODAY / NOW / RAND), das Neuberechnen liefert dieselben Ergebnisse.",
    recalcDone:
      "{cells} Zellen zum neuen Berechnungszeitpunkt neu berechnet (insgesamt {formulas} Formeln).",
    leave: "Verlassen",
  },
  fr: {
    recalcNoFormulas: "Ce classeur ne contient encore aucune formule : il n'y a rien à recalculer.",
    recalcUnchanged:
      "Ces formules ne changent pas avec le temps (pas de TODAY / NOW / RAND) : le recalcul donne les mêmes résultats.",
    recalcDone:
      "{cells} cellules recalculées au nouvel instant de calcul ({formulas} formules en tout).",
    leave: "Quitter",
  },
  it: {
    recalcNoFormulas:
      "Questa cartella di lavoro non contiene ancora formule, quindi non c'è nulla da ricalcolare.",
    recalcUnchanged:
      "Queste formule non cambiano nel tempo (nessuna TODAY / NOW / RAND), quindi il ricalcolo dà gli stessi risultati.",
    recalcDone:
      "Ricalcolate {cells} celle al nuovo istante di calcolo ({formulas} formule in totale).",
    leave: "Esci",
  },
  es: {
    recalcNoFormulas: "Este libro aún no tiene fórmulas, así que no hay nada que recalcular.",
    recalcUnchanged:
      "Estas fórmulas no cambian con el tiempo (no hay TODAY / NOW / RAND), así que al recalcular dan el mismo resultado.",
    recalcDone:
      "Se recalcularon {cells} celdas con el nuevo momento de cálculo ({formulas} fórmulas en total).",
    leave: "Salir",
  },
  "es-419": {
    recalcNoFormulas: "Este libro aún no tiene fórmulas, así que no hay nada que recalcular.",
    recalcUnchanged:
      "Estas fórmulas no cambian con el tiempo (no hay TODAY / NOW / RAND), así que al recalcular dan el mismo resultado.",
    recalcDone:
      "Se recalcularon {cells} celdas con el nuevo momento de cálculo ({formulas} fórmulas en total).",
    leave: "Salir",
  },
  "pt-BR": {
    recalcNoFormulas:
      "Esta pasta de trabalho ainda não tem fórmulas, então não há nada para recalcular.",
    recalcUnchanged:
      "Estas fórmulas não mudam com o tempo (sem TODAY / NOW / RAND), então recalcular dá os mesmos resultados.",
    recalcDone:
      "{cells} células recalculadas no novo momento de cálculo ({formulas} fórmulas no total).",
    leave: "Sair",
  },
  "pt-PT": {
    recalcNoFormulas: "Este livro ainda não tem fórmulas, pelo que não há nada para recalcular.",
    recalcUnchanged:
      "Estas fórmulas não mudam com o tempo (sem TODAY / NOW / RAND), pelo que recalcular dá os mesmos resultados.",
    recalcDone:
      "{cells} células recalculadas no novo momento de cálculo ({formulas} fórmulas no total).",
    leave: "Sair",
  },
  vi: {
    recalcNoFormulas: "Bảng tính này chưa có công thức nào nên không có ô nào cần tính lại.",
    recalcUnchanged:
      "Các công thức này không thay đổi theo thời gian (không có TODAY / NOW / RAND) nên tính lại vẫn cho kết quả như cũ.",
    recalcDone:
      "Đã tính lại {cells} ô theo thời điểm tính mới (toàn bảng có {formulas} công thức).",
    leave: "Rời đi",
  },
  tr: {
    recalcNoFormulas:
      "Bu çalışma kitabında henüz formül yok, dolayısıyla yeniden hesaplanacak bir hücre bulunmuyor.",
    recalcUnchanged:
      "Bu formüller zamana göre değişmiyor (TODAY / NOW / RAND yok), bu yüzden yeniden hesaplama aynı sonucu veriyor.",
    recalcDone:
      "Yeni hesaplama anına göre {cells} hücre yeniden hesaplandı (toplam {formulas} formül).",
    leave: "Ayrıl",
  },
  ja: {
    recalcNoFormulas: "このブックにはまだ数式がないため、再計算するセルはありません。",
    recalcUnchanged:
      "これらの数式は時間で変わりません（TODAY / NOW / RAND などがない）ため、再計算しても結果は同じです。",
    recalcDone:
      "新しい計算時刻で {cells} 個のセルを再計算しました（ブック全体で {formulas} 個の数式）。",
    leave: "離れる",
  },
  ko: {
    recalcNoFormulas: "이 통합 문서에는 아직 수식이 없어 다시 계산할 셀이 없습니다.",
    recalcUnchanged:
      "이 수식들은 시간에 따라 변하지 않아(TODAY / NOW / RAND 없음) 다시 계산해도 결과가 같습니다.",
    recalcDone: "새 계산 시각으로 {cells}개 셀을 다시 계산했습니다(전체 {formulas}개 수식).",
    leave: "나가기",
  },
  "zh-TW": {
    recalcNoFormulas: "這張工作簿裡還沒有公式，沒有需要重算的格子。",
    recalcUnchanged:
      "這些公式的結果不隨時間變（沒有 TODAY / NOW / RAND 一類），重算後與原來相同。",
    recalcDone: "已按新的計算時刻重算 {cells} 個格子（全表共 {formulas} 條公式）。",
    leave: "離開",
  },
  ar: {
    recalcNoFormulas: "لا يحتوي هذا المصنف على أي صيغ بعد، لذا لا توجد خلايا تحتاج إعادة حساب.",
    recalcUnchanged:
      "نتائج هذه الصيغ لا تتغير بمرور الوقت (لا توجد TODAY / NOW / RAND)، لذا تبقى كما هي بعد إعادة الحساب.",
    recalcDone: "تمت إعادة حساب {cells} خلية وفق لحظة الحساب الجديدة (إجمالي {formulas} صيغة).",
    leave: "مغادرة",
  },
  th: {
    recalcNoFormulas: "สมุดงานนี้ยังไม่มีสูตร จึงไม่มีเซลล์ที่ต้องคำนวณใหม่",
    recalcUnchanged:
      "ผลของสูตรเหล่านี้ไม่เปลี่ยนตามเวลา (ไม่มี TODAY / NOW / RAND) คำนวณใหม่แล้วได้ผลเดิม",
    recalcDone: "คำนวณใหม่ {cells} เซลล์ตามเวลาคำนวณใหม่ (ทั้งสมุดงานมี {formulas} สูตร)",
    leave: "ออก",
  },
  hi: {
    recalcNoFormulas:
      "इस वर्कबुक में अभी कोई फ़ॉर्मूला नहीं है, इसलिए दोबारा गणना करने के लिए कोई सेल नहीं है।",
    recalcUnchanged:
      "इन फ़ॉर्मूलों के नतीजे समय के साथ नहीं बदलते (TODAY / NOW / RAND जैसा कुछ नहीं है), इसलिए दोबारा गणना के बाद भी वही रहेंगे।",
    recalcDone:
      "नए गणना समय के अनुसार {cells} सेल दोबारा गिने गए (पूरी वर्कबुक में {formulas} फ़ॉर्मूले)।",
    leave: "छोड़ें",
  },
};

/** 语义名词典 → 「中文原文 → 译文」平表（`useUI()` 要的形状）。 */
function workbenchOfficeDictionaryFrom(
  messages: WorkbenchOfficeCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(WORKBENCH_OFFICE_COPY_SOURCE) as WorkbenchOfficeCopyName[]).map((name) => [
      WORKBENCH_OFFICE_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

/** 中文站：key 就是值，直接从原文表推，避免手抄一遍后与原文漂移。 */
const WORKBENCH_OFFICE_COPY_ZH: WorkbenchOfficeCopyMessages = {
  ...WORKBENCH_OFFICE_COPY_SOURCE,
};

export const WORKBENCH_OFFICE_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      workbenchOfficeDictionaryFrom(
        locale === "zh" ? WORKBENCH_OFFICE_COPY_ZH : WORKBENCH_OFFICE_TRANSLATIONS[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
