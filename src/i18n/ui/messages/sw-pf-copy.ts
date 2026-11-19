import type { Locale } from "../../config";

const COPY: Record<Locale, Record<string, string>> = {
  "en": {
    "项目管理员": "Admin",
    "项目成员": "Member",
    "项目查看者": "Viewer"
  },
  "zh": {
    "项目管理员": "管理员",
    "项目成员": "成员",
    "项目查看者": "查看者"
  },
  "zh-TW": {
    "项目管理员": "管理員",
    "项目成员": "成員",
    "项目查看者": "檢視者"
  },
  "de": {
    "项目管理员": "Admin",
    "项目成员": "Mitglied",
    "项目查看者": "Betrachter"
  },
  "es": {
    "项目管理员": "Administrador",
    "项目成员": "Miembro",
    "项目查看者": "Lector"
  },
  "fr": {
    "项目管理员": "Administrateur",
    "项目成员": "Membre",
    "项目查看者": "Lecteur"
  },
  "it": {
    "项目管理员": "Amministratore",
    "项目成员": "Membro",
    "项目查看者": "Lettore"
  },
  "pt-BR": {
    "项目管理员": "Administrador",
    "项目成员": "Membro",
    "项目查看者": "Leitor"
  },
  "pt-PT": {
    "项目管理员": "Administrador",
    "项目成员": "Membro",
    "项目查看者": "Leitor"
  },
  "vi": {
    "项目管理员": "Quản trị viên",
    "项目成员": "Thành viên",
    "项目查看者": "Người xem"
  },
  "tr": {
    "项目管理员": "Yönetici",
    "项目成员": "Üye",
    "项目查看者": "Görüntüleyici"
  },
  "ja": {
    "项目管理员": "管理者",
    "项目成员": "メンバー",
    "项目查看者": "閲覧者"
  },
  "ko": {
    "项目管理员": "관리자",
    "项目成员": "멤버",
    "项目查看者": "뷰어"
  },
  "ar": {
    "项目管理员": "المشرف",
    "项目成员": "العضو",
    "项目查看者": "المشاهد"
  },
  "th": {
    "项目管理员": "ผู้ดูแล",
    "项目成员": "สมาชิก",
    "项目查看者": "ผู้ดู"
  },
  "hi": {
    "项目管理员": "व्यवस्थापक",
    "项目成员": "सदस्य",
    "项目查看者": "दर्शक"
  },
  "es-419": {
    "项目管理员": "Administrador",
    "项目成员": "Miembro",
    "项目查看者": "Lector"
  }
};

export function swPfCopy(locale: Locale): Record<string, string> {
  return COPY[locale];
}
