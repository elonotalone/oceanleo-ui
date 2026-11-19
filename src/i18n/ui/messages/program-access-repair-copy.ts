import type { Locale } from "../../config";

const keys = [
  "Claude 订阅", "Console（按 API 计费）",
  "保存后会替换当前的 ChatGPT 登录（这台电脑上所有 Codex 都会改用这个 Key）",
  "在这台电脑的浏览器里登录", "开始 SSO 登录", "我知道了，继续", "换账号", "更换 {kind}", "正在退出登录…",
  "用 ChatGPT 登录（设备码）", "用 {provider} 账号登录", "登录尝试太频繁，请约 15 分钟后再试",
  "登录状态已丢失，请取消后重试。", "确认后会先退出，再选择新的登录方式。",
  "确认后会替换这台电脑上所有 Codex 的 ChatGPT 登录。", "确认退出", "请先确认后再保存或退出。",
  "请先确认退出登录。", "这个登录方式当前不可用。",
  "这台电脑上 {n} 个 {program} 正在运行，退出后它们都将失去登录", "连接断了，没拿到退出结果。",
  "退出后这台电脑上的 {program} 将失去登录。", "退出登录没有完成。", "长期令牌（setup-token）",
] as const;

// Each row follows the source-key order above; shared regional rows use neutral wording.
const en = [
  "Claude subscription", "Console (API billing)",
  "Saving replaces the current ChatGPT login. Every Codex on this computer will use this key.",
  "Sign in in this computer's browser", "Start SSO sign-in", "I understand, continue", "Switch account", "Replace {kind}", "Signing out…",
  "Sign in with ChatGPT (device code)", "Sign in with {provider}", "Too many sign-in attempts. Try again in about 15 minutes.",
  "Sign-in status was lost. Cancel and try again.", "This signs out first, then lets you choose a new sign-in method.",
  "This replaces the ChatGPT login for every Codex on this computer.", "Confirm sign-out", "Confirm before saving or signing out.",
  "Confirm sign-out first.", "This sign-in method is currently unavailable.",
  "{n} {program} processes are running on this computer. Signing out will sign them all out.", "The connection was lost before the sign-out result arrived.",
  "Signing out will also sign {program} out on this computer.", "Sign-out did not finish.", "Long-lived token (setup-token)",
];
const de = [
  "Claude-Abonnement", "Console (API-Abrechnung)",
  "Beim Speichern wird die aktuelle ChatGPT-Anmeldung ersetzt. Alle Codex auf diesem Computer verwenden dann diesen Schlüssel.",
  "Im Browser dieses Computers anmelden", "SSO-Anmeldung starten", "Verstanden, weiter", "Konto wechseln", "{kind} ersetzen", "Abmeldung läuft…",
  "Mit ChatGPT anmelden (Gerätecode)", "Mit {provider} anmelden", "Zu viele Anmeldeversuche. In etwa 15 Minuten erneut versuchen.",
  "Der Anmeldestatus ging verloren. Abbrechen und erneut versuchen.", "Zuerst erfolgt die Abmeldung, danach können Sie eine neue Anmeldemethode wählen.",
  "Die ChatGPT-Anmeldung aller Codex auf diesem Computer wird ersetzt.", "Abmeldung bestätigen", "Vor dem Speichern oder Abmelden bestätigen.",
  "Zuerst die Abmeldung bestätigen.", "Diese Anmeldemethode ist derzeit nicht verfügbar.",
  "Auf diesem Computer laufen {n} {program}-Prozesse. Durch die Abmeldung werden alle abgemeldet.", "Die Verbindung wurde unterbrochen, bevor das Abmeldeergebnis eintraf.",
  "Durch die Abmeldung wird auch {program} auf diesem Computer abgemeldet.", "Die Abmeldung wurde nicht abgeschlossen.", "Langlebiges Token (setup-token)",
];
const es = [
  "Suscripción a Claude", "Console (facturación por API)",
  "Al guardar se sustituye la sesión actual de ChatGPT. Todos los Codex de esta computadora usarán esta clave.",
  "Iniciar sesión en el navegador de esta computadora", "Iniciar sesión con SSO", "Entendido, continuar", "Cambiar de cuenta", "Sustituir {kind}", "Cerrando sesión…",
  "Iniciar sesión con ChatGPT (código de dispositivo)", "Iniciar sesión con {provider}", "Demasiados intentos de inicio de sesión. Inténtalo de nuevo en unos 15 minutos.",
  "Se perdió el estado de inicio de sesión. Cancela e inténtalo de nuevo.", "Primero se cerrará la sesión y luego podrás elegir otro método de acceso.",
  "Se sustituirá la sesión de ChatGPT de todos los Codex de esta computadora.", "Confirmar cierre de sesión", "Confirma antes de guardar o cerrar sesión.",
  "Confirma primero el cierre de sesión.", "Este método de acceso no está disponible ahora.",
  "Hay {n} procesos de {program} en esta computadora. Al cerrar sesión, todos perderán el acceso.", "Se perdió la conexión antes de recibir el resultado del cierre de sesión.",
  "Al cerrar sesión también se cerrará la sesión de {program} en esta computadora.", "No se completó el cierre de sesión.", "Token de larga duración (setup-token)",
];
const fr = [
  "Abonnement Claude", "Console (facturation API)",
  "L'enregistrement remplace la connexion ChatGPT actuelle. Tous les Codex de cet ordinateur utiliseront cette clé.",
  "Se connecter dans le navigateur de cet ordinateur", "Démarrer la connexion SSO", "Compris, continuer", "Changer de compte", "Remplacer {kind}", "Déconnexion en cours…",
  "Se connecter avec ChatGPT (code d'appareil)", "Se connecter avec {provider}", "Trop de tentatives de connexion. Réessayez dans environ 15 minutes.",
  "L'état de connexion a été perdu. Annulez et réessayez.", "Vous serez d'abord déconnecté, puis pourrez choisir une autre méthode de connexion.",
  "La connexion ChatGPT de tous les Codex de cet ordinateur sera remplacée.", "Confirmer la déconnexion", "Confirmez avant d'enregistrer ou de vous déconnecter.",
  "Confirmez d'abord la déconnexion.", "Cette méthode de connexion est actuellement indisponible.",
  "{n} processus {program} sont actifs sur cet ordinateur. La déconnexion les déconnectera tous.", "La connexion a été perdue avant la réception du résultat de déconnexion.",
  "La déconnexion déconnectera aussi {program} sur cet ordinateur.", "La déconnexion n'a pas abouti.", "Jeton de longue durée (setup-token)",
];
const it = [
  "Abbonamento Claude", "Console (fatturazione API)",
  "Il salvataggio sostituisce l'accesso ChatGPT attuale. Tutti i Codex su questo computer useranno questa chiave.",
  "Accedi nel browser di questo computer", "Avvia accesso SSO", "Ho capito, continua", "Cambia account", "Sostituisci {kind}", "Disconnessione…",
  "Accedi con ChatGPT (codice dispositivo)", "Accedi con {provider}", "Troppi tentativi di accesso. Riprova tra circa 15 minuti.",
  "Lo stato di accesso è andato perso. Annulla e riprova.", "Prima verrà eseguita la disconnessione, poi potrai scegliere un nuovo metodo di accesso.",
  "Verrà sostituito l'accesso ChatGPT di tutti i Codex su questo computer.", "Conferma disconnessione", "Conferma prima di salvare o disconnetterti.",
  "Conferma prima la disconnessione.", "Questo metodo di accesso non è disponibile al momento.",
  "Su questo computer sono attivi {n} processi {program}. Disconnettendoti perderanno tutti l'accesso.", "La connessione si è interrotta prima dell'esito della disconnessione.",
  "La disconnessione disconnetterà anche {program} su questo computer.", "La disconnessione non è stata completata.", "Token di lunga durata (setup-token)",
];
const pt = [
  "Assinatura Claude", "Console (cobrança por API)",
  "Ao guardar, o acesso atual ao ChatGPT será substituído. Todos os Codex neste computador usarão esta chave.",
  "Entrar no navegador deste computador", "Iniciar acesso SSO", "Entendi, continuar", "Mudar de conta", "Substituir {kind}", "A terminar sessão…",
  "Entrar com ChatGPT (código de dispositivo)", "Entrar com {provider}", "Demasiadas tentativas de acesso. Tente novamente em cerca de 15 minutos.",
  "O estado de acesso foi perdido. Cancele e tente novamente.", "Primeiro a sessão será terminada, depois poderá escolher outro método de acesso.",
  "O acesso ao ChatGPT de todos os Codex neste computador será substituído.", "Confirmar saída", "Confirme antes de guardar ou sair.",
  "Confirme primeiro a saída.", "Este método de acesso não está disponível agora.",
  "Há {n} processos de {program} neste computador. Ao sair, todos perderão o acesso.", "A ligação foi perdida antes de chegar o resultado da saída.",
  "Ao sair, {program} também perderá o acesso neste computador.", "A saída não foi concluída.", "Token de longa duração (setup-token)",
];
const vi = [
  "Gói đăng ký Claude", "Console (tính phí API)",
  "Lưu sẽ thay thế đăng nhập ChatGPT hiện tại. Tất cả Codex trên máy tính này sẽ dùng khóa này.",
  "Đăng nhập trong trình duyệt của máy tính này", "Bắt đầu đăng nhập SSO", "Tôi hiểu, tiếp tục", "Đổi tài khoản", "Thay {kind}", "Đang đăng xuất…",
  "Đăng nhập bằng ChatGPT (mã thiết bị)", "Đăng nhập bằng {provider}", "Quá nhiều lần thử đăng nhập. Hãy thử lại sau khoảng 15 phút.",
  "Đã mất trạng thái đăng nhập. Hãy hủy và thử lại.", "Bạn sẽ đăng xuất trước, rồi chọn cách đăng nhập mới.",
  "Đăng nhập ChatGPT của tất cả Codex trên máy tính này sẽ bị thay thế.", "Xác nhận đăng xuất", "Hãy xác nhận trước khi lưu hoặc đăng xuất.",
  "Hãy xác nhận đăng xuất trước.", "Cách đăng nhập này hiện không khả dụng.",
  "Có {n} tiến trình {program} đang chạy trên máy tính này. Đăng xuất sẽ khiến tất cả mất đăng nhập.", "Mất kết nối trước khi nhận kết quả đăng xuất.",
  "Đăng xuất cũng sẽ khiến {program} trên máy tính này mất đăng nhập.", "Đăng xuất chưa hoàn tất.", "Mã thông báo dài hạn (setup-token)",
];
const tr = [
  "Claude aboneliği", "Console (API faturalandırması)",
  "Kaydetmek mevcut ChatGPT oturumunu değiştirir. Bu bilgisayardaki tüm Codex işlemleri bu anahtarı kullanır.",
  "Bu bilgisayarın tarayıcısında oturum aç", "SSO oturum açmayı başlat", "Anladım, devam et", "Hesap değiştir", "{kind} değiştir", "Oturum kapatılıyor…",
  "ChatGPT ile oturum aç (cihaz kodu)", "{provider} ile oturum aç", "Çok fazla oturum açma denemesi. Yaklaşık 15 dakika sonra tekrar deneyin.",
  "Oturum açma durumu kayboldu. İptal edip tekrar deneyin.", "Önce oturum kapatılır, ardından yeni bir oturum açma yöntemi seçebilirsiniz.",
  "Bu bilgisayardaki tüm Codex işlemlerinin ChatGPT oturumu değiştirilir.", "Oturumu kapatmayı onayla", "Kaydetmeden veya çıkmadan önce onaylayın.",
  "Önce oturumu kapatmayı onaylayın.", "Bu oturum açma yöntemi şu anda kullanılamıyor.",
  "Bu bilgisayarda {n} {program} işlemi çalışıyor. Çıkış yapınca hepsinin oturumu kapanır.", "Oturum kapatma sonucu alınmadan bağlantı kesildi.",
  "Çıkış yapınca bu bilgisayardaki {program} oturumu da kapanır.", "Oturum kapatma tamamlanmadı.", "Uzun ömürlü belirteç (setup-token)",
];
const zhTW = [
  "Claude 訂閱", "Console（按 API 計費）",
  "儲存後會取代目前的 ChatGPT 登入（這台電腦上所有 Codex 都會改用這個 Key）",
  "在這台電腦的瀏覽器裡登入", "開始 SSO 登入", "我知道了，繼續", "換帳號", "更換 {kind}", "正在登出…",
  "用 ChatGPT 登入（裝置碼）", "用 {provider} 帳號登入", "登入嘗試太頻繁，請約 15 分鐘後再試",
  "登入狀態已遺失，請取消後重試。", "確認後會先登出，再選擇新的登入方式。",
  "確認後會取代這台電腦上所有 Codex 的 ChatGPT 登入。", "確認登出", "請先確認後再儲存或登出。",
  "請先確認登出。", "這個登入方式目前無法使用。",
  "這台電腦上 {n} 個 {program} 正在執行，登出後它們都將失去登入", "連線中斷，未取得登出結果。",
  "登出後這台電腦上的 {program} 將失去登入。", "登出尚未完成。", "長期權杖（setup-token）",
];
const ja = [
  "Claude サブスクリプション", "Console（API 従量課金）",
  "保存すると現在の ChatGPT ログインが置き換わります。このコンピューター上のすべての Codex がこのキーを使います。",
  "このコンピューターのブラウザーでログイン", "SSO ログインを開始", "理解して続行", "アカウントを切り替え", "{kind} を置き換え", "ログアウト中…",
  "ChatGPT でログイン（デバイスコード）", "{provider} でログイン", "ログイン試行が多すぎます。約15分後に再試行してください。",
  "ログイン状態が失われました。キャンセルして再試行してください。", "先にログアウトし、その後で新しいログイン方法を選びます。",
  "このコンピューター上のすべての Codex の ChatGPT ログインを置き換えます。", "ログアウトを確認", "保存またはログアウトする前に確認してください。",
  "先にログアウトを確認してください。", "このログイン方法は現在利用できません。",
  "このコンピューターで {n} 個の {program} が動作中です。ログアウトするとすべてのログインが解除されます。", "ログアウト結果の受信前に接続が切れました。",
  "ログアウトすると、このコンピューター上の {program} のログインも解除されます。", "ログアウトが完了しませんでした。", "長期トークン（setup-token）",
];
const ko = [
  "Claude 구독", "Console(API 사용량 과금)",
  "저장하면 현재 ChatGPT 로그인이 교체됩니다. 이 컴퓨터의 모든 Codex가 이 키를 사용하게 됩니다.",
  "이 컴퓨터의 브라우저에서 로그인", "SSO 로그인 시작", "이해했어요, 계속", "계정 전환", "{kind} 교체", "로그아웃 중…",
  "ChatGPT로 로그인(기기 코드)", "{provider} 계정으로 로그인", "로그인 시도가 너무 많습니다. 약 15분 후 다시 시도하세요.",
  "로그인 상태가 사라졌습니다. 취소하고 다시 시도하세요.", "먼저 로그아웃한 뒤 새로운 로그인 방식을 선택합니다.",
  "이 컴퓨터의 모든 Codex의 ChatGPT 로그인이 교체됩니다.", "로그아웃 확인", "저장하거나 로그아웃하기 전에 확인하세요.",
  "먼저 로그아웃을 확인하세요.", "이 로그인 방식은 현재 사용할 수 없습니다.",
  "이 컴퓨터에서 {n}개의 {program} 프로세스가 실행 중입니다. 로그아웃하면 모두 로그인이 해제됩니다.", "로그아웃 결과를 받기 전에 연결이 끊겼습니다.",
  "로그아웃하면 이 컴퓨터의 {program}도 로그인이 해제됩니다.", "로그아웃이 완료되지 않았습니다.", "장기 토큰(setup-token)",
];
const ar = [
  "اشتراك Claude", "Console (فوترة API)",
  "سيؤدي الحفظ إلى استبدال تسجيل دخول ChatGPT الحالي. ستستخدم جميع عمليات Codex على هذا الكمبيوتر هذا المفتاح.",
  "تسجيل الدخول في متصفح هذا الكمبيوتر", "بدء تسجيل الدخول الموحّد SSO", "فهمت، متابعة", "تبديل الحساب", "استبدال {kind}", "جارٍ تسجيل الخروج…",
  "تسجيل الدخول باستخدام ChatGPT (رمز الجهاز)", "تسجيل الدخول باستخدام {provider}", "محاولات تسجيل دخول كثيرة. حاول مجددًا بعد نحو 15 دقيقة.",
  "فُقدت حالة تسجيل الدخول. ألغِ العملية وحاول مجددًا.", "سيتم تسجيل الخروج أولًا، ثم يمكنك اختيار طريقة دخول جديدة.",
  "سيتم استبدال تسجيل دخول ChatGPT لجميع عمليات Codex على هذا الكمبيوتر.", "تأكيد تسجيل الخروج", "أكّد قبل الحفظ أو تسجيل الخروج.",
  "أكّد تسجيل الخروج أولًا.", "طريقة تسجيل الدخول هذه غير متاحة حاليًا.",
  "تعمل {n} عمليات {program} على هذا الكمبيوتر. سيؤدي تسجيل الخروج إلى خروجها جميعًا.", "انقطع الاتصال قبل وصول نتيجة تسجيل الخروج.",
  "سيؤدي تسجيل الخروج أيضًا إلى خروج {program} على هذا الكمبيوتر.", "لم يكتمل تسجيل الخروج.", "رمز طويل الأجل (setup-token)",
];
const th = [
  "การสมัครสมาชิก Claude", "Console (คิดค่าบริการ API)",
  "การบันทึกจะแทนที่การเข้าสู่ระบบ ChatGPT ปัจจุบัน Codex ทุกตัวบนคอมพิวเตอร์นี้จะใช้คีย์นี้",
  "เข้าสู่ระบบในเบราว์เซอร์ของคอมพิวเตอร์นี้", "เริ่มเข้าสู่ระบบ SSO", "เข้าใจแล้ว ดำเนินการต่อ", "สลับบัญชี", "แทนที่ {kind}", "กำลังออกจากระบบ…",
  "เข้าสู่ระบบด้วย ChatGPT (รหัสอุปกรณ์)", "เข้าสู่ระบบด้วย {provider}", "พยายามเข้าสู่ระบบบ่อยเกินไป โปรดลองอีกครั้งในประมาณ 15 นาที",
  "สถานะการเข้าสู่ระบบสูญหาย โปรดยกเลิกและลองอีกครั้ง", "ระบบจะออกจากระบบก่อน แล้วคุณจึงเลือกวิธีเข้าสู่ระบบใหม่ได้",
  "การเข้าสู่ระบบ ChatGPT ของ Codex ทุกตัวบนคอมพิวเตอร์นี้จะถูกแทนที่", "ยืนยันการออกจากระบบ", "โปรดยืนยันก่อนบันทึกหรือออกจากระบบ",
  "โปรดยืนยันการออกจากระบบก่อน", "วิธีเข้าสู่ระบบนี้ยังไม่พร้อมใช้งาน",
  "มี {program} ทำงานอยู่ {n} ตัวบนคอมพิวเตอร์นี้ การออกจากระบบจะทำให้ทั้งหมดออกจากระบบ", "การเชื่อมต่อขาดก่อนรับผลการออกจากระบบ",
  "การออกจากระบบจะทำให้ {program} บนคอมพิวเตอร์นี้ออกจากระบบด้วย", "การออกจากระบบยังไม่เสร็จสมบูรณ์", "โทเค็นระยะยาว (setup-token)",
];
const hi = [
  "Claude सदस्यता", "Console (API बिलिंग)",
  "सहेजने से मौजूदा ChatGPT लॉगिन बदल जाएगा। इस कंप्यूटर के सभी Codex इस कुंजी का उपयोग करेंगे।",
  "इस कंप्यूटर के ब्राउज़र में लॉगिन करें", "SSO लॉगिन शुरू करें", "समझ गया, जारी रखें", "खाता बदलें", "{kind} बदलें", "लॉगआउट हो रहा है…",
  "ChatGPT से लॉगिन करें (डिवाइस कोड)", "{provider} से लॉगिन करें", "बहुत अधिक लॉगिन प्रयास हुए। लगभग 15 मिनट बाद फिर कोशिश करें।",
  "लॉगिन स्थिति खो गई। रद्द करके फिर कोशिश करें।", "पहले लॉगआउट होगा, फिर आप नया लॉगिन तरीका चुन सकेंगे।",
  "इस कंप्यूटर के सभी Codex का ChatGPT लॉगिन बदल जाएगा।", "लॉगआउट की पुष्टि करें", "सहेजने या लॉगआउट करने से पहले पुष्टि करें।",
  "पहले लॉगआउट की पुष्टि करें।", "यह लॉगिन तरीका अभी उपलब्ध नहीं है।",
  "इस कंप्यूटर पर {n} {program} प्रक्रियाएँ चल रही हैं। लॉगआउट करने से सभी का लॉगिन समाप्त होगा।", "लॉगआउट का परिणाम मिलने से पहले कनेक्शन टूट गया।",
  "लॉगआउट करने से इस कंप्यूटर पर {program} का लॉगिन भी समाप्त होगा।", "लॉगआउट पूरा नहीं हुआ।", "लंबी अवधि का टोकन (setup-token)",
];

const rows: Record<Locale, readonly string[]> = { zh: keys, en, de, es, "es-419": es, fr, it, "pt-BR": pt, "pt-PT": pt, vi, tr, "zh-TW": zhTW, ja, ko, ar, th, hi };
export const PROGRAM_ACCESS_REPAIR_MESSAGES = Object.fromEntries(
  Object.entries(rows).map(([locale, values]) => {
    if (values.length !== keys.length) throw new Error(`Incomplete program access copy: ${locale}`);
    const dictionary = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
    dictionary["长期令牌"] = dictionary["长期令牌（setup-token）"].replace(/[（(]setup-token[）)]/, "").trim();
    return [locale, dictionary];
  }),
) as Record<Locale, Record<string, string>>;
