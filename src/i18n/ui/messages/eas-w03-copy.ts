// 2026-09-24 editors-and-shell 波 W03 的分表。只由 W03 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W03_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "正在思考 · {seconds} 秒": "正在思考 · {seconds} 秒",
  "正在思考… 已想 {chars} 字 · {seconds} 秒": "正在思考… 已想 {chars} 字 · {seconds} 秒",
} as const;

export const EAS_W03_MESSAGES = assembleCopy(SOURCE, {
  en: {
    "正在思考 · {seconds} 秒": "Thinking · {seconds}s",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "Thinking… {chars} chars · {seconds}s",
  },
  de: {
    "正在思考 · {seconds} 秒": "Denkt nach · {seconds} s",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "Denkt nach… {chars} Zeichen · {seconds} s",
  },
  es: {
    "正在思考 · {seconds} 秒": "Pensando · {seconds} s",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "Pensando… {chars} caracteres · {seconds} s",
  },
  "es-419": {
    "正在思考 · {seconds} 秒": "Pensando · {seconds} s",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "Pensando… {chars} caracteres · {seconds} s",
  },
  fr: {
    "正在思考 · {seconds} 秒": "Réflexion · {seconds} s",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "Réflexion… {chars} caractères · {seconds} s",
  },
  it: {
    "正在思考 · {seconds} 秒": "Sto pensando · {seconds} s",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "Sto pensando… {chars} caratteri · {seconds} s",
  },
  "pt-BR": {
    "正在思考 · {seconds} 秒": "Pensando · {seconds} s",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "Pensando… {chars} caracteres · {seconds} s",
  },
  "pt-PT": {
    "正在思考 · {seconds} 秒": "A pensar · {seconds} s",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "A pensar… {chars} caracteres · {seconds} s",
  },
  vi: {
    "正在思考 · {seconds} 秒": "Đang nghĩ · {seconds} giây",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "Đang nghĩ… {chars} chữ · {seconds} giây",
  },
  tr: {
    "正在思考 · {seconds} 秒": "Düşünüyor · {seconds} sn",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "Düşünüyor… {chars} karakter · {seconds} sn",
  },
  "zh-TW": {
    "正在思考 · {seconds} 秒": "正在思考 · {seconds} 秒",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "正在思考… 已想 {chars} 字 · {seconds} 秒",
  },
  ja: {
    "正在思考 · {seconds} 秒": "考え中 · {seconds} 秒",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "考え中… {chars} 字 · {seconds} 秒",
  },
  ko: {
    "正在思考 · {seconds} 秒": "생각 중 · {seconds}초",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "생각 중… {chars}자 · {seconds}초",
  },
  ar: {
    "正在思考 · {seconds} 秒": "يفكر · {seconds} ث",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "يفكر… {chars} حرفًا · {seconds} ث",
  },
  th: {
    "正在思考 · {seconds} 秒": "กำลังคิด · {seconds} วินาที",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "กำลังคิด… {chars} ตัวอักษร · {seconds} วินาที",
  },
  hi: {
    "正在思考 · {seconds} 秒": "सोच रहे हैं · {seconds} सेकंड",
    "正在思考… 已想 {chars} 字 · {seconds} 秒": "सोच रहे हैं… {chars} अक्षर · {seconds} सेकंड",
  },
});
