// 2026-10-24 skills-overhaul 波 W15 的分表。只由 W15 改；注册在 shell-overhaul-copy.ts（父改）。
// 输入框 `/` 调用技能（composer-skill-slash.tsx）。已在别的分表登记过的中文（「技能」「还没有技能」
// 「没有匹配的技能」「加载中…」「个人」）直接复用，不在这里重复登记。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  goAdd: "去添加",
  pickSkill: "选择技能",
  keyHint: "↑↓ 选择 · 回车插入 · Esc 关闭",
} as const;

export const SKO_W15_MESSAGES = assembleCopy(SOURCE, {
  en: {
    goAdd: "Add one",
    pickSkill: "Choose a skill",
    keyHint: "↑↓ to move · Enter to insert · Esc to close",
  },
  de: {
    goAdd: "Jetzt hinzufügen",
    pickSkill: "Skill auswählen",
    keyHint: "↑↓ auswählen · Enter einfügen · Esc schließen",
  },
  es: {
    goAdd: "Añadir uno",
    pickSkill: "Elegir una habilidad",
    keyHint: "↑↓ para moverte · Intro para insertar · Esc para cerrar",
  },
  "es-419": {
    goAdd: "Agregar una",
    pickSkill: "Elegir una habilidad",
    keyHint: "↑↓ para moverte · Enter para insertar · Esc para cerrar",
  },
  fr: {
    goAdd: "En ajouter",
    pickSkill: "Choisir une compétence",
    keyHint: "↑↓ pour naviguer · Entrée pour insérer · Échap pour fermer",
  },
  it: {
    goAdd: "Aggiungine una",
    pickSkill: "Scegli una skill",
    keyHint: "↑↓ per spostarti · Invio per inserire · Esc per chiudere",
  },
  "pt-BR": {
    goAdd: "Adicionar",
    pickSkill: "Escolher uma habilidade",
    keyHint: "↑↓ para navegar · Enter para inserir · Esc para fechar",
  },
  "pt-PT": {
    goAdd: "Adicionar",
    pickSkill: "Escolher uma competência",
    keyHint: "↑↓ para navegar · Enter para inserir · Esc para fechar",
  },
  vi: {
    goAdd: "Thêm ngay",
    pickSkill: "Chọn kỹ năng",
    keyHint: "↑↓ để chọn · Enter để chèn · Esc để đóng",
  },
  tr: {
    goAdd: "Ekle",
    pickSkill: "Beceri seç",
    keyHint: "↑↓ ile seç · Enter ile ekle · Esc ile kapat",
  },
  "zh-TW": {
    goAdd: "去新增",
    pickSkill: "選擇技能",
    keyHint: "↑↓ 選擇 · Enter 插入 · Esc 關閉",
  },
  ja: {
    goAdd: "追加する",
    pickSkill: "スキルを選択",
    keyHint: "↑↓ で選択 · Enter で挿入 · Esc で閉じる",
  },
  ko: {
    goAdd: "추가하기",
    pickSkill: "스킬 선택",
    keyHint: "↑↓ 선택 · Enter 삽입 · Esc 닫기",
  },
  ar: {
    goAdd: "أضف مهارة",
    pickSkill: "اختر مهارة",
    keyHint: "↑↓ للتنقل · Enter للإدراج · Esc للإغلاق",
  },
  th: {
    goAdd: "เพิ่มเลย",
    pickSkill: "เลือกสกิล",
    keyHint: "↑↓ เพื่อเลือก · Enter เพื่อแทรก · Esc เพื่อปิด",
  },
  hi: {
    goAdd: "जोड़ें",
    pickSkill: "स्किल चुनें",
    keyHint: "↑↓ से चुनें · Enter से डालें · Esc से बंद करें",
  },
});
