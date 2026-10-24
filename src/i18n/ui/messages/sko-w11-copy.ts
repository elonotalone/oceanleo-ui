// 2026-10-24 skills-overhaul 波 W11 的分表。只由 W11 改；注册在 shell-overhaul-copy.ts（父改）。
// 侧栏「我的任务」项目标注与「换项目」菜单。「移出项目」「项目」「未命名项目」复用已有词条。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  changeProject: "换项目",
  openProjectNamed: "打开项目「{name}」",
} as const;

export const SKO_W11_MESSAGES = assembleCopy(SOURCE, {
  de: {
    changeProject: "Projekt wechseln",
    openProjectNamed: "Projekt „{name}“ öffnen",
  },
  en: {
    changeProject: "Change project",
    openProjectNamed: "Open project “{name}”",
  },
  es: {
    changeProject: "Cambiar de proyecto",
    openProjectNamed: "Abrir el proyecto «{name}»",
  },
  "es-419": {
    changeProject: "Cambiar de proyecto",
    openProjectNamed: "Abrir el proyecto “{name}”",
  },
  fr: {
    changeProject: "Changer de projet",
    openProjectNamed: "Ouvrir le projet « {name} »",
  },
  it: {
    changeProject: "Cambia progetto",
    openProjectNamed: "Apri il progetto «{name}»",
  },
  "pt-BR": {
    changeProject: "Trocar de projeto",
    openProjectNamed: "Abrir o projeto “{name}”",
  },
  "pt-PT": {
    changeProject: "Mudar de projeto",
    openProjectNamed: "Abrir o projeto «{name}»",
  },
  vi: {
    changeProject: "Đổi dự án",
    openProjectNamed: "Mở dự án “{name}”",
  },
  tr: {
    changeProject: "Projeyi değiştir",
    openProjectNamed: "“{name}” projesini aç",
  },
  "zh-TW": {
    changeProject: "換專案",
    openProjectNamed: "開啟專案「{name}」",
  },
  ja: {
    changeProject: "プロジェクトを変更",
    openProjectNamed: "プロジェクト「{name}」を開く",
  },
  ko: {
    changeProject: "프로젝트 변경",
    openProjectNamed: "‘{name}’ 프로젝트 열기",
  },
  ar: {
    changeProject: "تغيير المشروع",
    openProjectNamed: "فتح المشروع «{name}»",
  },
  th: {
    changeProject: "เปลี่ยนโปรเจกต์",
    openProjectNamed: "เปิดโปรเจกต์ “{name}”",
  },
  hi: {
    changeProject: "प्रोजेक्ट बदलें",
    openProjectNamed: "प्रोजेक्ट “{name}” खोलें",
  },
});
