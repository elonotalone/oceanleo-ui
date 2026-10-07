// LeoChat 整页（W04）分表。登记在 bay-copy.ts。
// key = 简体中文原文。基础词典已有的（聊天 / 联系人 / 搜索 / 登录 / 我的 / 发布服务 / 返回 / 此功能暂未在本站开放）不在这里重复。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  pickChat: "选一个聊天开始。",
  signInChats: "登录后查看聊天和联系人",
} as const;

export const LEOCHAT_PAGE_MESSAGES = assembleCopy(SOURCE, {
  "zh-TW": {
    pickChat: "選一個聊天開始。",
    signInChats: "登入後查看聊天和聯絡人",
  },
  en: {
    pickChat: "Pick a chat to get started.",
    signInChats: "Log in to see chats and contacts",
  },
  ja: {
    pickChat: "チャットを選んで開始しましょう。",
    signInChats: "ログインするとチャットと連絡先を確認できます",
  },
  ko: {
    pickChat: "채팅을 선택해 시작하세요.",
    signInChats: "로그인하면 채팅과 연락처를 볼 수 있어요",
  },
  fr: {
    pickChat: "Choisissez une discussion pour commencer.",
    signInChats: "Connectez-vous pour voir les discussions et les contacts",
  },
  de: {
    pickChat: "Wähle einen Chat, um zu starten.",
    signInChats: "Melde dich an, um Chats und Kontakte zu sehen",
  },
  it: {
    pickChat: "Scegli una chat per iniziare.",
    signInChats: "Accedi per vedere chat e contatti",
  },
  es: {
    pickChat: "Elige un chat para empezar.",
    signInChats: "Inicia sesión para ver chats y contactos",
  },
  "es-419": {
    pickChat: "Elige un chat para empezar.",
    signInChats: "Inicia sesión para ver chats y contactos",
  },
  "pt-BR": {
    pickChat: "Escolha um chat para começar.",
    signInChats: "Entre para ver chats e contatos",
  },
  "pt-PT": {
    pickChat: "Escolha um chat para começar.",
    signInChats: "Inicie sessão para ver chats e contactos",
  },
  ar: {
    pickChat: "اختر محادثة للبدء.",
    signInChats: "سجّل الدخول لعرض المحادثات وجهات الاتصال",
  },
  hi: {
    pickChat: "शुरू करने के लिए एक चैट चुनें।",
    signInChats: "चैट और संपर्क देखने के लिए लॉग इन करें",
  },
  th: {
    pickChat: "เลือกแชทเพื่อเริ่มต้น",
    signInChats: "เข้าสู่ระบบเพื่อดูแชทและรายชื่อติดต่อ",
  },
  tr: {
    pickChat: "Başlamak için bir sohbet seç.",
    signInChats: "Sohbetleri ve kişileri görmek için giriş yap",
  },
  vi: {
    pickChat: "Chọn một cuộc trò chuyện để bắt đầu.",
    signInChats: "Đăng nhập để xem trò chuyện và danh bạ",
  },
});
