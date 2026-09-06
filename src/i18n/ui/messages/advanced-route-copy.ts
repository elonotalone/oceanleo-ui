// @oceanleo/ui — `/advanced` 路由壳（AdvancedFeaturePages）与编辑器崩溃边界
// （WorkbenchErrorBoundary）的文案词典（17 语）。
//
// 为什么单独成册（plugin-chrome X4，2026-09-06）：
//
// `AdvancedFeaturePages.tsx` 里 15 条中文一直没进任何词典——它是 2026-07 退役后
// 又被重新挂回来的过渡态，`i18n-tt-key-coverage` 对它整整红了 15 条；
// `WorkbenchErrorBoundary` 则是裸中文 JSX（连 `tt()` 都没过），外国用户看到的是
// 「这个编辑器出错了 … Minified React error #185」。这一册把两处一起补齐，
// 照 `workbench-office-copy.ts` 的办法用 `Record<Exclude<Locale, "zh">, …>` 把
// 16 个非中文语种钉进类型：少一个语种或少一条 key，`tsc --noEmit` 当场编不过。
//
// 不塞进 `plugin-chrome-copy-*`：那三册是本波所有子任务同时在写的共享文件，
// 单独一册只有本任务改，`git add` 不会顺手把别人的半成品带进提交。
//
// 崩溃边界那几句是**人话**：先说「发生了什么、你的东西有没有事、下一步点哪里」，
// 原始错误消息收进「技术细节」折叠里，不再当正文印给用户。

import { LOCALES, type Locale } from "../../config";

/** 中文原文即 key。语义名只用来让 17 张表按同一把尺子对齐。 */
export const ADVANCED_ROUTE_COPY_SOURCE = {
  // ---- /advanced 目录页与路由壳 ----
  title: "高级功能",
  catalogIntro:
    "独立于普通 App 的专业编辑空间。选择功能后可上传文件，或从跨站我的库继续已有内容。",
  notFound: "高级功能不存在",
  backToCatalog: "返回高级功能",
  openBlank: "打开空白工作台",
  opening: "正在打开高级功能…",
  openFailed: "无法打开高级功能，请返回后重试。",
  sessionLogin: "登录后即可打开这条高级功能任务。",
  sessionMissing: "高级功能任务不存在或已经删除。",
  sessionNoFeature: "这条任务没有可恢复的高级功能。",
  linkInvalid: "文件链接无效，请从我的库重新打开。",
  fileLogin: "登录后即可打开这个文件。",
  fileMissing: "文件不存在或已经删除。",
  fileUnrecoverable: "无法恢复这个文件，请从我的库重新打开。",
  noSafeEditor: "这个文件目前没有可安全保存的高级编辑器。",

  // ---- 编辑器崩溃边界（人话） ----
  routeCrashTitle: "编辑器刚才出了问题，已经停下",
  routeCrashBody:
    "你的素材没有被改动。点「重新载入」再试一次；也可以在左侧切到别的素材继续。",
  workbenchCrashTitle: "这件素材暂时打不开编辑器",
  workbenchCrashBody:
    "素材本身没有被改动。可以点「重新载入」再试，或先打开原内容确认文件还能用。",
  technicalDetails: "技术细节（给开发者看）",
  openOriginal: "打开原内容",
  reload: "重新载入",
  editorErrorDialog: "{title} · 编辑器错误",
};

export type AdvancedRouteCopyName = keyof typeof ADVANCED_ROUTE_COPY_SOURCE;

export type AdvancedRouteCopyMessages = Record<AdvancedRouteCopyName, string>;

const ADVANCED_ROUTE_TRANSLATIONS: Record<
  Exclude<Locale, "zh">,
  AdvancedRouteCopyMessages
> = {
  en: {
    title: "Advanced tools",
    catalogIntro:
      "A professional editing space separate from regular apps. Pick a tool, then upload a file or continue existing work from your cross-site library.",
    notFound: "This advanced tool doesn't exist",
    backToCatalog: "Back to advanced tools",
    openBlank: "Open a blank workbench",
    opening: "Opening the advanced tool…",
    openFailed: "Couldn't open the advanced tool. Go back and try again.",
    sessionLogin: "Sign in to open this advanced-tool task.",
    sessionMissing: "This advanced-tool task doesn't exist or has been deleted.",
    sessionNoFeature: "This task has no advanced tool to restore.",
    linkInvalid: "This file link is invalid. Open the file again from My Library.",
    fileLogin: "Sign in to open this file.",
    fileMissing: "This file doesn't exist or has been deleted.",
    fileUnrecoverable: "Couldn't restore this file. Open it again from My Library.",
    noSafeEditor: "This file has no advanced editor that can save it safely yet.",
    routeCrashTitle: "The editor hit a problem and stopped",
    routeCrashBody:
      "Your material was not changed. Click “Reload” to try again, or switch to another item on the left and keep working.",
    workbenchCrashTitle: "This item can't open in the editor right now",
    workbenchCrashBody:
      "The material itself was not changed. Click “Reload” to try again, or open the original first to check the file still works.",
    technicalDetails: "Technical details (for developers)",
    openOriginal: "Open original",
    reload: "Reload",
    editorErrorDialog: "{title} · Editor error",
  },
  de: {
    title: "Erweiterte Werkzeuge",
    catalogIntro:
      "Ein professioneller Bearbeitungsbereich, getrennt von normalen Apps. Wähle ein Werkzeug, lade dann eine Datei hoch oder arbeite an vorhandenen Inhalten aus deiner siteübergreifenden Bibliothek weiter.",
    notFound: "Dieses erweiterte Werkzeug existiert nicht",
    backToCatalog: "Zurück zu den erweiterten Werkzeugen",
    openBlank: "Leere Werkbank öffnen",
    opening: "Erweitertes Werkzeug wird geöffnet…",
    openFailed: "Das erweiterte Werkzeug konnte nicht geöffnet werden. Geh zurück und versuch es erneut.",
    sessionLogin: "Melde dich an, um diese Aufgabe mit erweitertem Werkzeug zu öffnen.",
    sessionMissing: "Diese Aufgabe existiert nicht oder wurde gelöscht.",
    sessionNoFeature: "Diese Aufgabe enthält kein wiederherstellbares erweitertes Werkzeug.",
    linkInvalid: "Dieser Dateilink ist ungültig. Öffne die Datei erneut aus „Meine Bibliothek“.",
    fileLogin: "Melde dich an, um diese Datei zu öffnen.",
    fileMissing: "Diese Datei existiert nicht oder wurde gelöscht.",
    fileUnrecoverable: "Diese Datei konnte nicht wiederhergestellt werden. Öffne sie erneut aus „Meine Bibliothek“.",
    noSafeEditor: "Für diese Datei gibt es noch keinen erweiterten Editor, der sicher speichern kann.",
    routeCrashTitle: "Der Editor hatte ein Problem und wurde angehalten",
    routeCrashBody:
      "Dein Material wurde nicht verändert. Klicke auf „Neu laden“, um es erneut zu versuchen, oder wechsle links zu einem anderen Element und arbeite weiter.",
    workbenchCrashTitle: "Dieses Element lässt sich gerade nicht im Editor öffnen",
    workbenchCrashBody:
      "Das Material selbst wurde nicht verändert. Klicke auf „Neu laden“, um es erneut zu versuchen, oder öffne zuerst das Original, um zu prüfen, ob die Datei noch funktioniert.",
    technicalDetails: "Technische Details (für Entwickler)",
    openOriginal: "Original öffnen",
    reload: "Neu laden",
    editorErrorDialog: "{title} · Editor-Fehler",
  },
  fr: {
    title: "Outils avancés",
    catalogIntro:
      "Un espace d'édition professionnel, distinct des applications classiques. Choisissez un outil, puis importez un fichier ou reprenez un contenu existant depuis votre bibliothèque multi-sites.",
    notFound: "Cet outil avancé n'existe pas",
    backToCatalog: "Retour aux outils avancés",
    openBlank: "Ouvrir un espace vide",
    opening: "Ouverture de l'outil avancé…",
    openFailed: "Impossible d'ouvrir l'outil avancé. Revenez en arrière et réessayez.",
    sessionLogin: "Connectez-vous pour ouvrir cette tâche d'outil avancé.",
    sessionMissing: "Cette tâche n'existe pas ou a été supprimée.",
    sessionNoFeature: "Cette tâche ne contient aucun outil avancé à restaurer.",
    linkInvalid: "Ce lien de fichier est invalide. Rouvrez le fichier depuis Ma bibliothèque.",
    fileLogin: "Connectez-vous pour ouvrir ce fichier.",
    fileMissing: "Ce fichier n'existe pas ou a été supprimé.",
    fileUnrecoverable: "Impossible de restaurer ce fichier. Rouvrez-le depuis Ma bibliothèque.",
    noSafeEditor: "Ce fichier n'a pas encore d'éditeur avancé capable de l'enregistrer en toute sécurité.",
    routeCrashTitle: "L'éditeur a rencontré un problème et s'est arrêté",
    routeCrashBody:
      "Votre contenu n'a pas été modifié. Cliquez sur « Recharger » pour réessayer, ou passez à un autre élément à gauche pour continuer.",
    workbenchCrashTitle: "Cet élément ne peut pas s'ouvrir dans l'éditeur pour le moment",
    workbenchCrashBody:
      "Le contenu lui-même n'a pas été modifié. Cliquez sur « Recharger » pour réessayer, ou ouvrez d'abord l'original pour vérifier que le fichier fonctionne toujours.",
    technicalDetails: "Détails techniques (pour les développeurs)",
    openOriginal: "Ouvrir l'original",
    reload: "Recharger",
    editorErrorDialog: "{title} · Erreur de l'éditeur",
  },
  it: {
    title: "Strumenti avanzati",
    catalogIntro:
      "Uno spazio di modifica professionale, separato dalle app normali. Scegli uno strumento, poi carica un file o continua un contenuto esistente dalla tua libreria multi-sito.",
    notFound: "Questo strumento avanzato non esiste",
    backToCatalog: "Torna agli strumenti avanzati",
    openBlank: "Apri un'area di lavoro vuota",
    opening: "Apertura dello strumento avanzato…",
    openFailed: "Impossibile aprire lo strumento avanzato. Torna indietro e riprova.",
    sessionLogin: "Accedi per aprire questa attività con strumento avanzato.",
    sessionMissing: "Questa attività non esiste o è stata eliminata.",
    sessionNoFeature: "Questa attività non contiene alcuno strumento avanzato da ripristinare.",
    linkInvalid: "Questo link al file non è valido. Riapri il file da La mia libreria.",
    fileLogin: "Accedi per aprire questo file.",
    fileMissing: "Questo file non esiste o è stato eliminato.",
    fileUnrecoverable: "Impossibile ripristinare questo file. Riaprilo da La mia libreria.",
    noSafeEditor: "Per questo file non c'è ancora un editor avanzato in grado di salvarlo in sicurezza.",
    routeCrashTitle: "L'editor ha riscontrato un problema e si è fermato",
    routeCrashBody:
      "Il tuo contenuto non è stato modificato. Fai clic su «Ricarica» per riprovare, oppure passa a un altro elemento a sinistra e continua a lavorare.",
    workbenchCrashTitle: "Questo elemento al momento non si apre nell'editor",
    workbenchCrashBody:
      "Il contenuto in sé non è stato modificato. Fai clic su «Ricarica» per riprovare, oppure apri prima l'originale per verificare che il file funzioni ancora.",
    technicalDetails: "Dettagli tecnici (per sviluppatori)",
    openOriginal: "Apri l'originale",
    reload: "Ricarica",
    editorErrorDialog: "{title} · Errore dell'editor",
  },
  es: {
    title: "Herramientas avanzadas",
    catalogIntro:
      "Un espacio de edición profesional, separado de las apps normales. Elige una herramienta y luego sube un archivo o continúa un contenido existente desde tu biblioteca multisitio.",
    notFound: "Esta herramienta avanzada no existe",
    backToCatalog: "Volver a herramientas avanzadas",
    openBlank: "Abrir un espacio de trabajo vacío",
    opening: "Abriendo la herramienta avanzada…",
    openFailed: "No se pudo abrir la herramienta avanzada. Vuelve atrás e inténtalo de nuevo.",
    sessionLogin: "Inicia sesión para abrir esta tarea de herramienta avanzada.",
    sessionMissing: "Esta tarea no existe o se ha eliminado.",
    sessionNoFeature: "Esta tarea no contiene ninguna herramienta avanzada que restaurar.",
    linkInvalid: "Este enlace de archivo no es válido. Vuelve a abrir el archivo desde Mi biblioteca.",
    fileLogin: "Inicia sesión para abrir este archivo.",
    fileMissing: "Este archivo no existe o se ha eliminado.",
    fileUnrecoverable: "No se pudo restaurar este archivo. Vuelve a abrirlo desde Mi biblioteca.",
    noSafeEditor: "Este archivo aún no tiene un editor avanzado que pueda guardarlo de forma segura.",
    routeCrashTitle: "El editor tuvo un problema y se detuvo",
    routeCrashBody:
      "Tu material no se ha modificado. Haz clic en «Recargar» para volver a intentarlo, o cambia a otro elemento a la izquierda y sigue trabajando.",
    workbenchCrashTitle: "Este elemento no se puede abrir en el editor ahora mismo",
    workbenchCrashBody:
      "El material en sí no se ha modificado. Haz clic en «Recargar» para volver a intentarlo, o abre primero el original para comprobar que el archivo sigue funcionando.",
    technicalDetails: "Detalles técnicos (para desarrolladores)",
    openOriginal: "Abrir original",
    reload: "Recargar",
    editorErrorDialog: "{title} · Error del editor",
  },
  "es-419": {
    title: "Herramientas avanzadas",
    catalogIntro:
      "Un espacio de edición profesional, separado de las apps normales. Elige una herramienta y luego sube un archivo o continúa un contenido existente desde tu biblioteca multisitio.",
    notFound: "Esta herramienta avanzada no existe",
    backToCatalog: "Volver a herramientas avanzadas",
    openBlank: "Abrir un espacio de trabajo vacío",
    opening: "Abriendo la herramienta avanzada…",
    openFailed: "No se pudo abrir la herramienta avanzada. Regresa e inténtalo de nuevo.",
    sessionLogin: "Inicia sesión para abrir esta tarea de herramienta avanzada.",
    sessionMissing: "Esta tarea no existe o fue eliminada.",
    sessionNoFeature: "Esta tarea no contiene ninguna herramienta avanzada para restaurar.",
    linkInvalid: "Este enlace de archivo no es válido. Vuelve a abrir el archivo desde Mi biblioteca.",
    fileLogin: "Inicia sesión para abrir este archivo.",
    fileMissing: "Este archivo no existe o fue eliminado.",
    fileUnrecoverable: "No se pudo restaurar este archivo. Vuelve a abrirlo desde Mi biblioteca.",
    noSafeEditor: "Este archivo todavía no tiene un editor avanzado que pueda guardarlo de forma segura.",
    routeCrashTitle: "El editor tuvo un problema y se detuvo",
    routeCrashBody:
      "Tu material no se modificó. Haz clic en «Recargar» para intentarlo de nuevo, o cambia a otro elemento a la izquierda y sigue trabajando.",
    workbenchCrashTitle: "Este elemento no se puede abrir en el editor en este momento",
    workbenchCrashBody:
      "El material en sí no se modificó. Haz clic en «Recargar» para intentarlo de nuevo, o abre primero el original para comprobar que el archivo sigue funcionando.",
    technicalDetails: "Detalles técnicos (para desarrolladores)",
    openOriginal: "Abrir original",
    reload: "Recargar",
    editorErrorDialog: "{title} · Error del editor",
  },
  "pt-BR": {
    title: "Ferramentas avançadas",
    catalogIntro:
      "Um espaço de edição profissional, separado dos apps comuns. Escolha uma ferramenta e depois envie um arquivo ou continue um conteúdo existente da sua biblioteca entre sites.",
    notFound: "Esta ferramenta avançada não existe",
    backToCatalog: "Voltar para ferramentas avançadas",
    openBlank: "Abrir uma área de trabalho em branco",
    opening: "Abrindo a ferramenta avançada…",
    openFailed: "Não foi possível abrir a ferramenta avançada. Volte e tente de novo.",
    sessionLogin: "Entre para abrir esta tarefa de ferramenta avançada.",
    sessionMissing: "Esta tarefa não existe ou foi excluída.",
    sessionNoFeature: "Esta tarefa não tem nenhuma ferramenta avançada para restaurar.",
    linkInvalid: "Este link de arquivo é inválido. Abra o arquivo de novo em Minha biblioteca.",
    fileLogin: "Entre para abrir este arquivo.",
    fileMissing: "Este arquivo não existe ou foi excluído.",
    fileUnrecoverable: "Não foi possível restaurar este arquivo. Abra-o de novo em Minha biblioteca.",
    noSafeEditor: "Este arquivo ainda não tem um editor avançado que consiga salvá-lo com segurança.",
    routeCrashTitle: "O editor teve um problema e parou",
    routeCrashBody:
      "Seu material não foi alterado. Clique em “Recarregar” para tentar de novo, ou mude para outro item à esquerda e continue trabalhando.",
    workbenchCrashTitle: "Este item não pode ser aberto no editor agora",
    workbenchCrashBody:
      "O material em si não foi alterado. Clique em “Recarregar” para tentar de novo, ou abra primeiro o original para confirmar que o arquivo ainda funciona.",
    technicalDetails: "Detalhes técnicos (para desenvolvedores)",
    openOriginal: "Abrir original",
    reload: "Recarregar",
    editorErrorDialog: "{title} · Erro do editor",
  },
  "pt-PT": {
    title: "Ferramentas avançadas",
    catalogIntro:
      "Um espaço de edição profissional, separado das apps normais. Escolha uma ferramenta e depois carregue um ficheiro ou continue um conteúdo existente a partir da sua biblioteca entre sites.",
    notFound: "Esta ferramenta avançada não existe",
    backToCatalog: "Voltar às ferramentas avançadas",
    openBlank: "Abrir uma área de trabalho vazia",
    opening: "A abrir a ferramenta avançada…",
    openFailed: "Não foi possível abrir a ferramenta avançada. Volte atrás e tente novamente.",
    sessionLogin: "Inicie sessão para abrir esta tarefa de ferramenta avançada.",
    sessionMissing: "Esta tarefa não existe ou foi eliminada.",
    sessionNoFeature: "Esta tarefa não tem nenhuma ferramenta avançada para restaurar.",
    linkInvalid: "Esta ligação de ficheiro é inválida. Abra o ficheiro novamente a partir de A minha biblioteca.",
    fileLogin: "Inicie sessão para abrir este ficheiro.",
    fileMissing: "Este ficheiro não existe ou foi eliminado.",
    fileUnrecoverable: "Não foi possível restaurar este ficheiro. Abra-o novamente a partir de A minha biblioteca.",
    noSafeEditor: "Este ficheiro ainda não tem um editor avançado capaz de o guardar em segurança.",
    routeCrashTitle: "O editor teve um problema e parou",
    routeCrashBody:
      "O seu material não foi alterado. Clique em “Recarregar” para tentar novamente, ou mude para outro item à esquerda e continue a trabalhar.",
    workbenchCrashTitle: "Este item não pode ser aberto no editor neste momento",
    workbenchCrashBody:
      "O material em si não foi alterado. Clique em “Recarregar” para tentar novamente, ou abra primeiro o original para confirmar que o ficheiro ainda funciona.",
    technicalDetails: "Detalhes técnicos (para programadores)",
    openOriginal: "Abrir original",
    reload: "Recarregar",
    editorErrorDialog: "{title} · Erro do editor",
  },
  vi: {
    title: "Công cụ nâng cao",
    catalogIntro:
      "Không gian chỉnh sửa chuyên nghiệp, tách biệt với các ứng dụng thông thường. Chọn một công cụ, rồi tải tệp lên hoặc tiếp tục nội dung sẵn có từ thư viện liên trang của bạn.",
    notFound: "Công cụ nâng cao này không tồn tại",
    backToCatalog: "Quay lại công cụ nâng cao",
    openBlank: "Mở bàn làm việc trống",
    opening: "Đang mở công cụ nâng cao…",
    openFailed: "Không mở được công cụ nâng cao. Hãy quay lại và thử lại.",
    sessionLogin: "Đăng nhập để mở tác vụ công cụ nâng cao này.",
    sessionMissing: "Tác vụ này không tồn tại hoặc đã bị xóa.",
    sessionNoFeature: "Tác vụ này không có công cụ nâng cao nào để khôi phục.",
    linkInvalid: "Liên kết tệp không hợp lệ. Hãy mở lại tệp từ Thư viện của tôi.",
    fileLogin: "Đăng nhập để mở tệp này.",
    fileMissing: "Tệp này không tồn tại hoặc đã bị xóa.",
    fileUnrecoverable: "Không khôi phục được tệp này. Hãy mở lại từ Thư viện của tôi.",
    noSafeEditor: "Tệp này hiện chưa có trình chỉnh sửa nâng cao nào lưu được an toàn.",
    routeCrashTitle: "Trình chỉnh sửa gặp sự cố và đã dừng",
    routeCrashBody:
      "Tài liệu của bạn không bị thay đổi. Nhấn “Tải lại” để thử lại, hoặc chuyển sang mục khác ở bên trái để tiếp tục làm việc.",
    workbenchCrashTitle: "Mục này hiện không mở được trong trình chỉnh sửa",
    workbenchCrashBody:
      "Bản thân tài liệu không bị thay đổi. Nhấn “Tải lại” để thử lại, hoặc mở bản gốc trước để kiểm tra tệp vẫn dùng được.",
    technicalDetails: "Chi tiết kỹ thuật (dành cho nhà phát triển)",
    openOriginal: "Mở bản gốc",
    reload: "Tải lại",
    editorErrorDialog: "{title} · Lỗi trình chỉnh sửa",
  },
  tr: {
    title: "Gelişmiş araçlar",
    catalogIntro:
      "Normal uygulamalardan ayrı, profesyonel bir düzenleme alanı. Bir araç seçin, ardından bir dosya yükleyin veya siteler arası kitaplığınızdaki mevcut içerikten devam edin.",
    notFound: "Bu gelişmiş araç mevcut değil",
    backToCatalog: "Gelişmiş araçlara dön",
    openBlank: "Boş çalışma alanı aç",
    opening: "Gelişmiş araç açılıyor…",
    openFailed: "Gelişmiş araç açılamadı. Geri dönüp yeniden deneyin.",
    sessionLogin: "Bu gelişmiş araç görevini açmak için oturum açın.",
    sessionMissing: "Bu görev mevcut değil veya silinmiş.",
    sessionNoFeature: "Bu görevde geri yüklenecek bir gelişmiş araç yok.",
    linkInvalid: "Bu dosya bağlantısı geçersiz. Dosyayı Kitaplığım'dan yeniden açın.",
    fileLogin: "Bu dosyayı açmak için oturum açın.",
    fileMissing: "Bu dosya mevcut değil veya silinmiş.",
    fileUnrecoverable: "Bu dosya geri yüklenemedi. Kitaplığım'dan yeniden açın.",
    noSafeEditor: "Bu dosya için henüz güvenle kaydedebilen bir gelişmiş düzenleyici yok.",
    routeCrashTitle: "Düzenleyici bir sorunla karşılaştı ve durdu",
    routeCrashBody:
      "Materyaliniz değiştirilmedi. Yeniden denemek için “Yeniden yükle”ye tıklayın veya soldan başka bir öğeye geçip çalışmaya devam edin.",
    workbenchCrashTitle: "Bu öğe şu anda düzenleyicide açılamıyor",
    workbenchCrashBody:
      "Materyalin kendisi değiştirilmedi. Yeniden denemek için “Yeniden yükle”ye tıklayın veya dosyanın hâlâ çalıştığını doğrulamak için önce orijinali açın.",
    technicalDetails: "Teknik ayrıntılar (geliştiriciler için)",
    openOriginal: "Orijinali aç",
    reload: "Yeniden yükle",
    editorErrorDialog: "{title} · Düzenleyici hatası",
  },
  "zh-TW": {
    title: "進階功能",
    catalogIntro:
      "獨立於一般 App 的專業編輯空間。選擇功能後可上傳檔案，或從跨站我的庫繼續既有內容。",
    notFound: "進階功能不存在",
    backToCatalog: "返回進階功能",
    openBlank: "開啟空白工作台",
    opening: "正在開啟進階功能…",
    openFailed: "無法開啟進階功能，請返回後重試。",
    sessionLogin: "登入後即可開啟這條進階功能任務。",
    sessionMissing: "進階功能任務不存在或已經刪除。",
    sessionNoFeature: "這條任務沒有可恢復的進階功能。",
    linkInvalid: "檔案連結無效，請從我的庫重新開啟。",
    fileLogin: "登入後即可開啟這個檔案。",
    fileMissing: "檔案不存在或已經刪除。",
    fileUnrecoverable: "無法恢復這個檔案，請從我的庫重新開啟。",
    noSafeEditor: "這個檔案目前沒有可安全儲存的進階編輯器。",
    routeCrashTitle: "編輯器剛才出了問題，已經停下",
    routeCrashBody:
      "你的素材沒有被改動。點「重新載入」再試一次；也可以在左側切到別的素材繼續。",
    workbenchCrashTitle: "這件素材暫時打不開編輯器",
    workbenchCrashBody:
      "素材本身沒有被改動。可以點「重新載入」再試，或先開啟原內容確認檔案還能用。",
    technicalDetails: "技術細節（給開發者看）",
    openOriginal: "開啟原內容",
    reload: "重新載入",
    editorErrorDialog: "{title} · 編輯器錯誤",
  },
  ja: {
    title: "高度なツール",
    catalogIntro:
      "通常のアプリとは別の、プロ向け編集スペースです。ツールを選んでからファイルをアップロードするか、サイト共通のマイライブラリにある既存の内容から続けられます。",
    notFound: "この高度なツールは存在しません",
    backToCatalog: "高度なツールに戻る",
    openBlank: "空のワークベンチを開く",
    opening: "高度なツールを開いています…",
    openFailed: "高度なツールを開けませんでした。戻ってやり直してください。",
    sessionLogin: "ログインすると、この高度なツールのタスクを開けます。",
    sessionMissing: "このタスクは存在しないか、すでに削除されています。",
    sessionNoFeature: "このタスクには復元できる高度なツールがありません。",
    linkInvalid: "ファイルのリンクが無効です。マイライブラリからもう一度開いてください。",
    fileLogin: "ログインすると、このファイルを開けます。",
    fileMissing: "このファイルは存在しないか、すでに削除されています。",
    fileUnrecoverable: "このファイルを復元できませんでした。マイライブラリからもう一度開いてください。",
    noSafeEditor: "このファイルには、安全に保存できる高度なエディターがまだありません。",
    routeCrashTitle: "エディターに問題が起きて停止しました",
    routeCrashBody:
      "素材は変更されていません。「再読み込み」を押してもう一度試すか、左側で別の素材に切り替えて作業を続けてください。",
    workbenchCrashTitle: "この素材は今エディターで開けません",
    workbenchCrashBody:
      "素材そのものは変更されていません。「再読み込み」でもう一度試すか、まず元の内容を開いてファイルがまだ使えるか確認してください。",
    technicalDetails: "技術的な詳細（開発者向け）",
    openOriginal: "元の内容を開く",
    reload: "再読み込み",
    editorErrorDialog: "{title} · エディターのエラー",
  },
  ko: {
    title: "고급 도구",
    catalogIntro:
      "일반 앱과 분리된 전문 편집 공간입니다. 도구를 선택한 뒤 파일을 업로드하거나, 사이트 공용 내 라이브러리의 기존 콘텐츠에서 이어서 작업하세요.",
    notFound: "이 고급 도구는 존재하지 않습니다",
    backToCatalog: "고급 도구로 돌아가기",
    openBlank: "빈 작업대 열기",
    opening: "고급 도구를 여는 중…",
    openFailed: "고급 도구를 열 수 없습니다. 돌아가서 다시 시도하세요.",
    sessionLogin: "로그인하면 이 고급 도구 작업을 열 수 있습니다.",
    sessionMissing: "이 작업은 존재하지 않거나 이미 삭제되었습니다.",
    sessionNoFeature: "이 작업에는 복원할 고급 도구가 없습니다.",
    linkInvalid: "파일 링크가 올바르지 않습니다. 내 라이브러리에서 다시 열어 주세요.",
    fileLogin: "로그인하면 이 파일을 열 수 있습니다.",
    fileMissing: "이 파일은 존재하지 않거나 이미 삭제되었습니다.",
    fileUnrecoverable: "이 파일을 복원할 수 없습니다. 내 라이브러리에서 다시 열어 주세요.",
    noSafeEditor: "이 파일에는 아직 안전하게 저장할 수 있는 고급 편집기가 없습니다.",
    routeCrashTitle: "편집기에 문제가 생겨 멈췄습니다",
    routeCrashBody:
      "소재는 변경되지 않았습니다. “다시 불러오기”를 눌러 다시 시도하거나, 왼쪽에서 다른 소재로 전환해 계속 작업하세요.",
    workbenchCrashTitle: "이 소재는 지금 편집기에서 열 수 없습니다",
    workbenchCrashBody:
      "소재 자체는 변경되지 않았습니다. “다시 불러오기”를 눌러 다시 시도하거나, 먼저 원본을 열어 파일이 아직 정상인지 확인하세요.",
    technicalDetails: "기술 세부 정보(개발자용)",
    openOriginal: "원본 열기",
    reload: "다시 불러오기",
    editorErrorDialog: "{title} · 편집기 오류",
  },
  ar: {
    title: "الأدوات المتقدمة",
    catalogIntro:
      "مساحة تحرير احترافية منفصلة عن التطبيقات العادية. اختر أداة، ثم ارفع ملفًا أو تابع محتوى موجودًا من مكتبتك المشتركة بين المواقع.",
    notFound: "هذه الأداة المتقدمة غير موجودة",
    backToCatalog: "العودة إلى الأدوات المتقدمة",
    openBlank: "فتح مساحة عمل فارغة",
    opening: "جارٍ فتح الأداة المتقدمة…",
    openFailed: "تعذّر فتح الأداة المتقدمة. ارجع وحاول مرة أخرى.",
    sessionLogin: "سجّل الدخول لفتح مهمة الأداة المتقدمة هذه.",
    sessionMissing: "هذه المهمة غير موجودة أو تم حذفها.",
    sessionNoFeature: "لا تحتوي هذه المهمة على أداة متقدمة يمكن استعادتها.",
    linkInvalid: "رابط الملف غير صالح. افتح الملف مرة أخرى من «مكتبتي».",
    fileLogin: "سجّل الدخول لفتح هذا الملف.",
    fileMissing: "هذا الملف غير موجود أو تم حذفه.",
    fileUnrecoverable: "تعذّرت استعادة هذا الملف. افتحه مرة أخرى من «مكتبتي».",
    noSafeEditor: "لا يوجد لهذا الملف حتى الآن محرر متقدم يمكنه الحفظ بأمان.",
    routeCrashTitle: "واجه المحرر مشكلة وتوقّف",
    routeCrashBody:
      "لم يتم تغيير مادتك. انقر على «إعادة التحميل» للمحاولة مرة أخرى، أو انتقل إلى عنصر آخر على اليسار وتابع العمل.",
    workbenchCrashTitle: "لا يمكن فتح هذا العنصر في المحرر الآن",
    workbenchCrashBody:
      "المادة نفسها لم تتغير. انقر على «إعادة التحميل» للمحاولة مرة أخرى، أو افتح الأصل أولًا للتأكد من أن الملف لا يزال يعمل.",
    technicalDetails: "تفاصيل تقنية (للمطوّرين)",
    openOriginal: "فتح الأصل",
    reload: "إعادة التحميل",
    editorErrorDialog: "{title} · خطأ في المحرر",
  },
  th: {
    title: "เครื่องมือขั้นสูง",
    catalogIntro:
      "พื้นที่แก้ไขระดับมืออาชีพที่แยกจากแอปทั่วไป เลือกเครื่องมือ แล้วอัปโหลดไฟล์ หรือทำต่อจากเนื้อหาที่มีอยู่ในคลังของฉันที่ใช้ร่วมกันทุกเว็บไซต์",
    notFound: "ไม่มีเครื่องมือขั้นสูงนี้",
    backToCatalog: "กลับไปที่เครื่องมือขั้นสูง",
    openBlank: "เปิดพื้นที่ทำงานว่าง",
    opening: "กำลังเปิดเครื่องมือขั้นสูง…",
    openFailed: "เปิดเครื่องมือขั้นสูงไม่ได้ กรุณาย้อนกลับแล้วลองอีกครั้ง",
    sessionLogin: "เข้าสู่ระบบเพื่อเปิดงานเครื่องมือขั้นสูงนี้",
    sessionMissing: "ไม่มีงานนี้หรือถูกลบไปแล้ว",
    sessionNoFeature: "งานนี้ไม่มีเครื่องมือขั้นสูงที่กู้คืนได้",
    linkInvalid: "ลิงก์ไฟล์ไม่ถูกต้อง กรุณาเปิดไฟล์อีกครั้งจากคลังของฉัน",
    fileLogin: "เข้าสู่ระบบเพื่อเปิดไฟล์นี้",
    fileMissing: "ไม่มีไฟล์นี้หรือถูกลบไปแล้ว",
    fileUnrecoverable: "กู้คืนไฟล์นี้ไม่ได้ กรุณาเปิดอีกครั้งจากคลังของฉัน",
    noSafeEditor: "ไฟล์นี้ยังไม่มีตัวแก้ไขขั้นสูงที่บันทึกได้อย่างปลอดภัย",
    routeCrashTitle: "ตัวแก้ไขพบปัญหาและหยุดทำงาน",
    routeCrashBody:
      "สื่อของคุณไม่ได้ถูกเปลี่ยนแปลง คลิก “โหลดใหม่” เพื่อลองอีกครั้ง หรือสลับไปยังรายการอื่นทางซ้ายแล้วทำงานต่อ",
    workbenchCrashTitle: "รายการนี้เปิดในตัวแก้ไขไม่ได้ในขณะนี้",
    workbenchCrashBody:
      "สื่อต้นฉบับไม่ได้ถูกเปลี่ยนแปลง คลิก “โหลดใหม่” เพื่อลองอีกครั้ง หรือเปิดต้นฉบับก่อนเพื่อตรวจสอบว่าไฟล์ยังใช้งานได้",
    technicalDetails: "รายละเอียดทางเทคนิค (สำหรับนักพัฒนา)",
    openOriginal: "เปิดต้นฉบับ",
    reload: "โหลดใหม่",
    editorErrorDialog: "{title} · ข้อผิดพลาดของตัวแก้ไข",
  },
  hi: {
    title: "उन्नत टूल",
    catalogIntro:
      "सामान्य ऐप्स से अलग एक पेशेवर संपादन स्थान। कोई टूल चुनें, फिर फ़ाइल अपलोड करें या अपनी क्रॉस-साइट लाइब्रेरी की मौजूदा सामग्री से आगे बढ़ें।",
    notFound: "यह उन्नत टूल मौजूद नहीं है",
    backToCatalog: "उन्नत टूल पर वापस जाएँ",
    openBlank: "खाली वर्कबेंच खोलें",
    opening: "उन्नत टूल खोला जा रहा है…",
    openFailed: "उन्नत टूल नहीं खुल सका। वापस जाकर फिर कोशिश करें।",
    sessionLogin: "इस उन्नत टूल कार्य को खोलने के लिए साइन इन करें।",
    sessionMissing: "यह कार्य मौजूद नहीं है या हटा दिया गया है।",
    sessionNoFeature: "इस कार्य में पुनर्स्थापित करने के लिए कोई उन्नत टूल नहीं है।",
    linkInvalid: "यह फ़ाइल लिंक अमान्य है। फ़ाइल को मेरी लाइब्रेरी से दोबारा खोलें।",
    fileLogin: "इस फ़ाइल को खोलने के लिए साइन इन करें।",
    fileMissing: "यह फ़ाइल मौजूद नहीं है या हटा दी गई है।",
    fileUnrecoverable: "यह फ़ाइल पुनर्स्थापित नहीं हो सकी। इसे मेरी लाइब्रेरी से दोबारा खोलें।",
    noSafeEditor: "इस फ़ाइल के लिए अभी कोई ऐसा उन्नत एडिटर नहीं है जो इसे सुरक्षित रूप से सहेज सके।",
    routeCrashTitle: "एडिटर में समस्या आई और वह रुक गया",
    routeCrashBody:
      "आपकी सामग्री में कोई बदलाव नहीं हुआ। फिर से कोशिश करने के लिए “फिर से लोड करें” पर क्लिक करें, या बाईं ओर किसी और आइटम पर जाकर काम जारी रखें।",
    workbenchCrashTitle: "यह आइटम अभी एडिटर में नहीं खुल सकता",
    workbenchCrashBody:
      "सामग्री में कोई बदलाव नहीं हुआ है। फिर से कोशिश करने के लिए “फिर से लोड करें” पर क्लिक करें, या पहले मूल सामग्री खोलकर जाँच लें कि फ़ाइल अभी भी काम करती है।",
    technicalDetails: "तकनीकी विवरण (डेवलपर्स के लिए)",
    openOriginal: "मूल खोलें",
    reload: "फिर से लोड करें",
    editorErrorDialog: "{title} · एडिटर त्रुटि",
  },
};

/** 语义名词典 → 「中文原文 → 译文」平表（`useUI()` 要的形状）。 */
function advancedRouteDictionaryFrom(
  messages: AdvancedRouteCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(ADVANCED_ROUTE_COPY_SOURCE) as AdvancedRouteCopyName[]).map(
      (name) => [ADVANCED_ROUTE_COPY_SOURCE[name], messages[name]],
    ),
  );
}

/** 中文站：key 就是值，直接从原文表推，避免手抄一遍后与原文漂移。 */
const ADVANCED_ROUTE_COPY_ZH: AdvancedRouteCopyMessages = {
  ...ADVANCED_ROUTE_COPY_SOURCE,
};

export const ADVANCED_ROUTE_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      advancedRouteDictionaryFrom(
        locale === "zh"
          ? ADVANCED_ROUTE_COPY_ZH
          : ADVANCED_ROUTE_TRANSLATIONS[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
