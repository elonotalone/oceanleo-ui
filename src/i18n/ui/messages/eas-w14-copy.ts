// 2026-09-24 editors-and-shell 波 W14 的分表；2026-10-22 自动保存收口：不再有按钮文案。
// 后台提示只在自动恢复也无法解决的永久失败时出现（登录过期 / 冲突 / 权限），没有按钮。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "这份文件已在其他标签页或设备上修改，请重新加载。": "这份文件已在其他标签页或设备上修改，请重新加载。",
  "有 {n} 份修改暂时无法保存，草稿已保留": "有 {n} 份修改暂时无法保存，草稿已保留",
  "登录已过期，重新登录后会自动保存 {n} 份修改": "登录已过期，重新登录后会自动保存 {n} 份修改",
  已保存: "已保存",
} as const;

export const EAS_W14_MESSAGES = assembleCopy(SOURCE, {
  "en": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "This file changed in another tab or on another device. Reload it.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} changes could not be saved yet; your draft is kept",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "Your session expired. {n} changes will save automatically after you sign in again",
    已保存: "Saved",
  },
  "de": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "Diese Datei wurde in einem anderen Tab oder auf einem anderen Gerät geändert. Bitte neu laden.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} Änderungen konnten noch nicht gespeichert werden; der Entwurf bleibt erhalten",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "Die Sitzung ist abgelaufen. {n} Änderungen werden nach erneuter Anmeldung automatisch gespeichert",
    已保存: "Gespeichert",
  },
  "es": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "Este archivo cambió en otra pestaña o dispositivo. Vuelve a cargarlo.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} cambios no se pudieron guardar todavía; el borrador se conserva",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "La sesión caducó. {n} cambios se guardarán automáticamente al iniciar sesión de nuevo",
    已保存: "Guardado",
  },
  "es-419": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "Este archivo cambió en otra pestaña o dispositivo. Vuelve a cargarlo.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} cambios no se pudieron guardar todavía; el borrador se conserva",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "La sesión caducó. {n} cambios se guardarán automáticamente al iniciar sesión de nuevo",
    已保存: "Guardado",
  },
  "fr": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "Ce fichier a été modifié dans un autre onglet ou sur un autre appareil. Rechargez-le.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} modification(s) n’ont pas pu être enregistrées ; le brouillon est conservé",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "Session expirée. {n} modification(s) seront enregistrées automatiquement après reconnexion",
    已保存: "Enregistré",
  },
  "it": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "Questo file è stato modificato in un’altra scheda o su un altro dispositivo. Ricaricalo.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} modifiche non sono state ancora salvate; la bozza è conservata",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "Sessione scaduta. {n} modifiche verranno salvate automaticamente dopo il nuovo accesso",
    已保存: "Salvato",
  },
  "pt-BR": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "Este arquivo foi alterado em outra aba ou dispositivo. Recarregue-o.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} alterações não puderam ser salvas ainda; o rascunho foi mantido",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "Sua sessão expirou. {n} alterações serão salvas automaticamente após entrar novamente",
    已保存: "Salvo",
  },
  "pt-PT": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "Este ficheiro foi alterado noutro separador ou dispositivo. Volte a carregá-lo.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} alterações ainda não puderam ser guardadas; o rascunho foi mantido",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "A sessão expirou. {n} alterações serão guardadas automaticamente depois de iniciar sessão novamente",
    已保存: "Guardado",
  },
  "vi": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "Tệp này đã thay đổi trong thẻ hoặc thiết bị khác. Hãy tải lại.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} thay đổi chưa thể lưu; bản nháp vẫn được giữ lại",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "Phiên đăng nhập đã hết hạn. {n} thay đổi sẽ tự động được lưu sau khi bạn đăng nhập lại",
    已保存: "Đã lưu",
  },
  "tr": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "Bu dosya başka bir sekmede veya cihazda değiştirildi. Yeniden yükleyin.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} değişiklik henüz kaydedilemedi; taslak korunuyor",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "Oturum süresi doldu. {n} değişiklik yeniden giriş yaptıktan sonra otomatik kaydedilecek",
    已保存: "Kaydedildi",
  },
  "zh-TW": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "這份檔案已在其他分頁或裝置上修改，請重新載入。",
    "有 {n} 份修改暂时无法保存，草稿已保留": "有 {n} 份修改暫時無法儲存，草稿已保留",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "登入已過期，重新登入後會自動儲存 {n} 份修改",
    已保存: "已保存",
  },
  "ja": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "このファイルは別のタブまたはデバイスで変更されました。再読み込みしてください。",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} 件の変更をまだ保存できていません。下書きは保持されています",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "ログインの有効期限が切れました。再ログイン後に {n} 件の変更が自動で保存されます",
    已保存: "保存しました",
  },
  "ko": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "다른 탭이나 기기에서 이 파일이 변경되었습니다. 새로고침해 주세요.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "수정 {n}개를 아직 저장하지 못했습니다. 초안은 보관되어 있습니다",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "로그인이 만료되었습니다. 다시 로그인하면 수정 {n}개가 자동으로 저장됩니다",
    已保存: "저장됨",
  },
  "ar": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "تم تعديل هذا الملف في علامة تبويب أخرى أو على جهاز آخر. أعد تحميله.",
    "有 {n} 份修改暂时无法保存，草稿已保留": "تعذّر حفظ {n} تعديلات حتى الآن، والمسودة محفوظة",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "انتهت صلاحية الجلسة. سيتم حفظ {n} تعديلات تلقائيًا بعد تسجيل الدخول مجددًا",
    已保存: "تم الحفظ",
  },
  "th": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "ไฟล์นี้ถูกแก้ไขในแท็บหรืออุปกรณ์อื่น โปรดโหลดใหม่",
    "有 {n} 份修改暂时无法保存，草稿已保留": "ยังบันทึกการแก้ไข {n} รายการไม่ได้ แต่เก็บฉบับร่างไว้แล้ว",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "เซสชันหมดอายุ การแก้ไข {n} รายการจะบันทึกอัตโนมัติหลังคุณเข้าสู่ระบบอีกครั้ง",
    已保存: "บันทึกแล้ว",
  },
  "hi": {
    "这份文件已在其他标签页或设备上修改，请重新加载。": "यह फ़ाइल दूसरे टैब या डिवाइस पर बदली गई है। इसे फिर से लोड करें।",
    "有 {n} 份修改暂时无法保存，草稿已保留": "{n} बदलाव अभी सहेजे नहीं जा सके; ड्राफ़्ट सुरक्षित है",
    "登录已过期，重新登录后会自动保存 {n} 份修改": "सत्र समाप्त हो गया। दोबारा साइन इन करने पर {n} बदलाव अपने आप सहेज लिए जाएँगे",
    已保存: "सहेजा गया",
  },
});
