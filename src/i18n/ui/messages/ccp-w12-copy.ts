// 2026-09-23 cloud-computer-polish 波 W12 的分表。只由 W12 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const CCP_W12_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "所有者": "所有者",
  "管理员": "管理员",
  "组织成员": "组织成员",
  "个人": "个人",
  "创建团队": "创建团队",
  "账户": "账户",
  "余额": "余额",
  "个性化": "个性化",
  "设置": "设置",
  "主页": "主页",
  "获取帮助": "获取帮助",
  "使用文档": "使用文档",
  "退出登录": "退出登录",
  "关闭": "关闭",
} as const;

export const CCP_W12_MESSAGES = assembleCopy(SOURCE, {
  en: { "所有者": "Owner", "管理员": "Admin", "组织成员": "Organization member", "个人": "Personal", "创建团队": "Create team", "账户": "Account", "余额": "Balance", "个性化": "Personalization", "设置": "Settings", "主页": "Homepage", "获取帮助": "Get help", "使用文档": "Docs", "退出登录": "Sign out", "关闭": "Close" },
  de: { "所有者": "Eigentümer", "管理员": "Admin", "组织成员": "Organisationsmitglied", "个人": "Persönlich", "创建团队": "Team erstellen", "账户": "Konto", "余额": "Guthaben", "个性化": "Personalisierung", "设置": "Einstellungen", "主页": "Startseite", "获取帮助": "Hilfe", "使用文档": "Dokumentation", "退出登录": "Abmelden", "关闭": "Schließen" },
  es: { "所有者": "Propietario", "管理员": "Administrador", "组织成员": "Miembro de la organización", "个人": "Personal", "创建团队": "Crear equipo", "账户": "Cuenta", "余额": "Saldo", "个性化": "Personalización", "设置": "Ajustes", "主页": "Inicio", "获取帮助": "Obtener ayuda", "使用文档": "Documentación", "退出登录": "Cerrar sesión", "关闭": "Cerrar" },
  "es-419": { "所有者": "Propietario", "管理员": "Administrador", "组织成员": "Miembro de la organización", "个人": "Personal", "创建团队": "Crear equipo", "账户": "Cuenta", "余额": "Saldo", "个性化": "Personalización", "设置": "Configuración", "主页": "Inicio", "获取帮助": "Obtener ayuda", "使用文档": "Documentación", "退出登录": "Cerrar sesión", "关闭": "Cerrar" },
  fr: { "所有者": "Propriétaire", "管理员": "Administrateur", "组织成员": "Membre de l’organisation", "个人": "Personnel", "创建团队": "Créer une équipe", "账户": "Compte", "余额": "Solde", "个性化": "Personnalisation", "设置": "Paramètres", "主页": "Accueil", "获取帮助": "Obtenir de l'aide", "使用文档": "Documentation", "退出登录": "Se déconnecter", "关闭": "Fermer" },
  it: { "所有者": "Proprietario", "管理员": "Amministratore", "组织成员": "Membro dell’organizzazione", "个人": "Personale", "创建团队": "Crea team", "账户": "Account", "余额": "Saldo", "个性化": "Personalizzazione", "设置": "Impostazioni", "主页": "Home", "获取帮助": "Chiedi aiuto", "使用文档": "Documentazione", "退出登录": "Esci", "关闭": "Chiudi" },
  "pt-BR": { "所有者": "Proprietário", "管理员": "Administrador", "组织成员": "Membro da organização", "个人": "Pessoal", "创建团队": "Criar equipe", "账户": "Conta", "余额": "Saldo", "个性化": "Personalização", "设置": "Configurações", "主页": "Página inicial", "获取帮助": "Obter ajuda", "使用文档": "Documentação", "退出登录": "Sair", "关闭": "Fechar" },
  "pt-PT": { "所有者": "Proprietário", "管理员": "Administrador", "组织成员": "Membro da organização", "个人": "Pessoal", "创建团队": "Criar equipa", "账户": "Conta", "余额": "Saldo", "个性化": "Personalização", "设置": "Definições", "主页": "Página inicial", "获取帮助": "Obter ajuda", "使用文档": "Documentação", "退出登录": "Terminar sessão", "关闭": "Fechar" },
  vi: { "所有者": "Chủ sở hữu", "管理员": "Quản trị viên", "组织成员": "Thành viên tổ chức", "个人": "Cá nhân", "创建团队": "Tạo nhóm", "账户": "Tài khoản", "余额": "Số dư", "个性化": "Cá nhân hóa", "设置": "Cài đặt", "主页": "Trang chủ", "获取帮助": "Nhận trợ giúp", "使用文档": "Tài liệu", "退出登录": "Đăng xuất", "关闭": "Đóng" },
  tr: { "所有者": "Sahip", "管理员": "Yönetici", "组织成员": "Kuruluş üyesi", "个人": "Kişisel", "创建团队": "Ekip oluştur", "账户": "Hesap", "余额": "Bakiye", "个性化": "Kişiselleştirme", "设置": "Ayarlar", "主页": "Ana sayfa", "获取帮助": "Yardım al", "使用文档": "Belgeler", "退出登录": "Çıkış yap", "关闭": "Kapat" },
  "zh-TW": { "所有者": "擁有者", "管理员": "管理員", "组织成员": "組織成員", "个人": "個人", "创建团队": "建立團隊", "账户": "帳戶", "余额": "餘額", "个性化": "個人化", "设置": "設定", "主页": "首頁", "获取帮助": "取得協助", "使用文档": "文件", "退出登录": "登出", "关闭": "關閉" },
  ja: { "所有者": "所有者", "管理员": "管理者", "组织成员": "組織メンバー", "个人": "個人", "创建团队": "チームを作成", "账户": "アカウント", "余额": "残高", "个性化": "パーソナライズ", "设置": "設定", "主页": "ホーム", "获取帮助": "ヘルプ", "使用文档": "ドキュメント", "退出登录": "ログアウト", "关闭": "閉じる" },
  ko: { "所有者": "소유자", "管理员": "관리자", "组织成员": "조직 멤버", "个人": "개인", "创建团队": "팀 만들기", "账户": "계정", "余额": "잔액", "个性化": "개인 설정", "设置": "설정", "主页": "홈", "获取帮助": "도움말", "使用文档": "문서", "退出登录": "로그아웃", "关闭": "닫기" },
  ar: { "所有者": "المالك", "管理员": "مسؤول", "组织成员": "عضو في المنظمة", "个人": "شخصي", "创建团队": "إنشاء فريق", "账户": "الحساب", "余额": "الرصيد", "个性化": "التخصيص", "设置": "الإعدادات", "主页": "الصفحة الرئيسية", "获取帮助": "الحصول على المساعدة", "使用文档": "المستندات", "退出登录": "تسجيل الخروج", "关闭": "إغلاق" },
  th: { "所有者": "เจ้าของ", "管理员": "ผู้ดูแลระบบ", "组织成员": "สมาชิกองค์กร", "个人": "ส่วนตัว", "创建团队": "สร้างทีม", "账户": "บัญชี", "余额": "ยอดเงิน", "个性化": "ปรับเฉพาะบุคคล", "设置": "การตั้งค่า", "主页": "หน้าหลัก", "获取帮助": "ขอความช่วยเหลือ", "使用文档": "เอกสาร", "退出登录": "ออกจากระบบ", "关闭": "ปิด" },
  hi: { "所有者": "मालिक", "管理员": "व्यवस्थापक", "组织成员": "संगठन सदस्य", "个人": "व्यक्तिगत", "创建团队": "टीम बनाएं", "账户": "खाता", "余额": "शेष राशि", "个性化": "वैयक्तिकरण", "设置": "सेटिंग", "主页": "होम", "获取帮助": "मदद लें", "使用文档": "दस्तावेज़", "退出登录": "साइन आउट", "关闭": "बंद करें" },
});
