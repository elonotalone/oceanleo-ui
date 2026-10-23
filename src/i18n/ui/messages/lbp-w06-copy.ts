// 2026-10-23 leobay-projects 波 W06 的分表。只由 W06 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const LBP_W06_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
// 只放新的中文原文；已有词条不要在这里重定义（合并次序会让它覆盖别处的译文）。
//
// 本表的内容：我的主页编辑状态里的「资质核验」卡、交易会话系统消息的新落点与两句改名、
// 设置 → 账户里的「用 OceanLeo 账号登录的应用」、我的主页上退役种类名的改写。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  // 我的主页 · 资质核验卡（page/ProfilePageEditor 挂 seller/BayVettingSection）
  vettingTitle: "资质核验",
  vettingIntro:
    "提交可公开查验的执业或资格编号和查验来源，核验结果会显示在这里。不收证件照片和身份证号；这一块只有你自己看得到。",
  // 主页上的种类名改写（§5.1）
  nothingPublished: "还没有发布任何东西。",
  unpublishedHint: "这张主页现在只有你自己看得到。公开之后别人才能访问，发布东西时也会自动公开。",
  officialAssets: "官方现成文件",
  browseOfficialAssets: "逛官方现成文件",
  // 交易会话系统消息
  dealVettingRejected: "这条人工服务没有通过资质核验，可以查看理由并申诉一次。",
  dealVettingExpired: "资质核验已到期，相关人工服务已转回草稿。",
  viewMyPage: "查看我的主页",
  // 设置 → 账户 → 用 OceanLeo 账号登录的应用
  connectedApps: "用 OceanLeo 账号登录的应用",
  connectedAppsHint: "查看你授权过的应用，随时可以撤回。",
  grantsSignIn: "登录后查看你授权过的应用",
  grantsEmpty: "还没有应用用你的 OceanLeo 账号登录过。你在某个应用里同意登录后，它会出现在这里，随时可以撤回。",
  grantRevokeExplain: "撤回后这个应用要再让你同意一次才能登录",
  grantRevokeFailed: "没撤回成功，请稍后再试。",
} as const;

export const LBP_W06_MESSAGES = assembleCopy(SOURCE, {
  en: {
    vettingTitle: "Verification",
    vettingIntro:
      "Submit a publicly checkable practice or qualification number and where it can be checked. The result will show here. We do not take ID photos or ID numbers. Only you can see this section.",
    nothingPublished: "Nothing published yet.",
    unpublishedHint:
      "Only you can see this page right now. Others can visit it once it is public, and it becomes public automatically when you publish something.",
    officialAssets: "Official ready-made files",
    browseOfficialAssets: "Browse official ready-made files",
    dealVettingRejected: "This human service did not pass credential review. You can read the reason and appeal once.",
    dealVettingExpired: "Credential review expired. Related human services were moved back to draft.",
    viewMyPage: "View my page",
    connectedApps: "Apps using your OceanLeo sign-in",
    connectedAppsHint: "See the apps you have authorized. You can revoke access any time.",
    grantsSignIn: "Sign in to see apps you have authorized",
    grantsEmpty:
      "No app has signed you in with your OceanLeo account yet. Once you agree to sign in to an app, it will appear here, and you can revoke it any time.",
    grantRevokeExplain: "After you revoke this, the app must ask you to agree again before you can sign in",
    grantRevokeFailed: "Could not revoke. Please try again later.",
  },
  de: {
    vettingTitle: "Qualifikationsprüfung",
    vettingIntro:
      "Reiche eine öffentlich überprüfbare Berufs- oder Qualifikationsnummer und die Prüfquelle ein. Das Ergebnis erscheint hier. Ausweisfotos und Ausweisnummern werden nicht verlangt. Nur du siehst diesen Bereich.",
    nothingPublished: "Noch nichts veröffentlicht.",
    unpublishedHint:
      "Diese Seite siehst im Moment nur du. Andere können sie erst besuchen, wenn sie öffentlich ist – sie wird automatisch öffentlich, sobald du etwas veröffentlichst.",
    officialAssets: "Offizielle fertige Dateien",
    browseOfficialAssets: "Offizielle fertige Dateien ansehen",
    dealVettingRejected:
      "Diese persönliche Dienstleistung hat die Prüfung nicht bestanden. Grund einsehen und einmal widersprechen.",
    dealVettingExpired: "Die Prüfung ist abgelaufen. Zugehörige persönliche Dienstleistungen sind wieder Entwürfe.",
    viewMyPage: "Meine Seite ansehen",
    connectedApps: "Apps mit deiner OceanLeo-Anmeldung",
    connectedAppsHint: "Sieh dir die Apps an, die du autorisiert hast. Du kannst den Zugriff jederzeit widerrufen.",
    grantsSignIn: "Melde dich an, um Apps zu sehen, denen du Zugriff gegeben hast",
    grantsEmpty:
      "Noch keine App hat dich mit deinem OceanLeo-Konto angemeldet. Sobald du in einer App der Anmeldung zustimmst, erscheint sie hier, und du kannst sie jederzeit widerrufen.",
    grantRevokeExplain: "Nach dem Widerruf muss diese App dich erneut um Zustimmung bitten, bevor du dich anmelden kannst",
    grantRevokeFailed: "Widerruf fehlgeschlagen. Bitte versuche es später erneut.",
  },
  es: {
    vettingTitle: "Verificación",
    vettingIntro:
      "Envía un número de ejercicio profesional o de titulación que se pueda comprobar públicamente y la fuente donde se comprueba. El resultado aparecerá aquí. No pedimos fotos de documentos ni números de identificación. Solo tú ves esta sección.",
    nothingPublished: "Aún no hay nada publicado.",
    unpublishedHint:
      "Ahora mismo solo tú puedes ver esta página. Los demás podrán visitarla cuando sea pública, y se hará pública automáticamente cuando publiques algo.",
    officialAssets: "Archivos oficiales ya hechos",
    browseOfficialAssets: "Ver los archivos oficiales ya hechos",
    dealVettingRejected: "Este servicio humano no pasó la verificación. Puedes ver el motivo y apelar una vez.",
    dealVettingExpired: "La verificación caducó. Los servicios humanos relacionados volvieron a borrador.",
    viewMyPage: "Ver mi página",
    connectedApps: "Aplicaciones que usan tu inicio de sesión de OceanLeo",
    connectedAppsHint: "Consulta las aplicaciones que has autorizado. Puedes revocar el acceso en cualquier momento.",
    grantsSignIn: "Inicia sesión para ver las aplicaciones que has autorizado",
    grantsEmpty:
      "Todavía ninguna aplicación te ha iniciado sesión con tu cuenta de OceanLeo. Cuando aceptes iniciar sesión en una aplicación, aparecerá aquí y podrás revocarlo cuando quieras.",
    grantRevokeExplain: "Tras revocar, esta aplicación tendrá que pedirte de nuevo el consentimiento para iniciar sesión",
    grantRevokeFailed: "No se pudo revocar. Inténtalo de nuevo más tarde.",
  },
  "es-419": {
    vettingTitle: "Verificación",
    vettingIntro:
      "Envía un número de licencia profesional o de título que se pueda verificar públicamente y la fuente donde se verifica. El resultado aparecerá aquí. No pedimos fotos de documentos ni números de identificación. Solo tú ves esta sección.",
    nothingPublished: "Aún no hay nada publicado.",
    unpublishedHint:
      "Ahora mismo solo tú puedes ver esta página. Los demás podrán visitarla cuando sea pública, y pasará a ser pública automáticamente cuando publiques algo.",
    officialAssets: "Archivos oficiales ya listos",
    browseOfficialAssets: "Ver los archivos oficiales ya listos",
    dealVettingRejected: "Este servicio humano no pasó la verificación. Puedes ver el motivo y apelar una vez.",
    dealVettingExpired: "La verificación caducó. Los servicios humanos relacionados volvieron a borrador.",
    viewMyPage: "Ver mi página",
    connectedApps: "Aplicaciones que usan tu inicio de sesión de OceanLeo",
    connectedAppsHint: "Consulta las aplicaciones que autorizaste. Puedes revocar el acceso en cualquier momento.",
    grantsSignIn: "Inicia sesión para ver las aplicaciones que autorizaste",
    grantsEmpty:
      "Todavía ninguna aplicación te ha iniciado sesión con tu cuenta de OceanLeo. Cuando aceptes iniciar sesión en una aplicación, aparecerá aquí y podrás revocarlo cuando quieras.",
    grantRevokeExplain:
      "Después de revocar, esta aplicación tiene que pedirte de nuevo el consentimiento para iniciar sesión",
    grantRevokeFailed: "No se pudo revocar. Inténtalo de nuevo más tarde.",
  },
  fr: {
    vettingTitle: "Vérification",
    vettingIntro:
      "Indiquez un numéro d’exercice ou de qualification vérifiable publiquement, ainsi que la source de vérification. Le résultat s’affichera ici. Nous ne demandons ni photo de pièce d’identité ni numéro d’identité. Vous seul voyez cette section.",
    nothingPublished: "Rien n’est encore publié.",
    unpublishedHint:
      "Pour l’instant, vous seul voyez cette page. Les autres pourront la visiter une fois qu’elle sera publique ; elle le devient automatiquement quand vous publiez quelque chose.",
    officialAssets: "Fichiers officiels tout prêts",
    browseOfficialAssets: "Parcourir les fichiers officiels tout prêts",
    dealVettingRejected:
      "Ce service humain n’a pas passé la vérification. Vous pouvez lire le motif et faire un recours.",
    dealVettingExpired: "La vérification a expiré. Les services humains concernés sont repassés en brouillon.",
    viewMyPage: "Voir ma page",
    connectedApps: "Applications utilisant votre connexion OceanLeo",
    connectedAppsHint: "Consultez les applications que vous avez autorisées. Vous pouvez révoquer l’accès à tout moment.",
    grantsSignIn: "Connectez-vous pour voir les applications que vous avez autorisées",
    grantsEmpty:
      "Aucune application ne vous a encore connecté avec votre compte OceanLeo. Quand vous accepterez de vous connecter à une application, elle apparaîtra ici et vous pourrez révoquer l’accès à tout moment.",
    grantRevokeExplain: "Après révocation, cette application devra de nouveau demander votre accord pour vous connecter",
    grantRevokeFailed: "La révocation a échoué. Réessayez plus tard.",
  },
  it: {
    vettingTitle: "Verifica",
    vettingIntro:
      "Invia un numero di abilitazione o qualifica verificabile pubblicamente e la fonte di verifica. L’esito comparirà qui. Non chiediamo foto di documenti né numeri di identità. Solo tu vedi questa sezione.",
    nothingPublished: "Non è ancora stato pubblicato nulla.",
    unpublishedHint:
      "Per ora questa pagina la vedi solo tu. Gli altri potranno visitarla quando sarà pubblica, e lo diventa automaticamente quando pubblichi qualcosa.",
    officialAssets: "File ufficiali già pronti",
    browseOfficialAssets: "Sfoglia i file ufficiali già pronti",
    dealVettingRejected:
      "Questo servizio umano non ha superato la verifica. Puoi leggere il motivo e fare un ricorso.",
    dealVettingExpired: "La verifica è scaduta. I servizi umani correlati sono tornati in bozza.",
    viewMyPage: "Vedi la mia pagina",
    connectedApps: "App che usano il tuo accesso OceanLeo",
    connectedAppsHint: "Vedi le app che hai autorizzato. Puoi revocare l’accesso in qualsiasi momento.",
    grantsSignIn: "Accedi per vedere le app che hai autorizzato",
    grantsEmpty:
      "Nessuna app ti ha ancora fatto accedere con il tuo account OceanLeo. Quando accetti di accedere a un’app, comparirà qui e potrai revocare l’autorizzazione in qualsiasi momento.",
    grantRevokeExplain: "Dopo la revoca, questa app dovrà chiederti di nuovo il consenso per accedere",
    grantRevokeFailed: "Revoca non riuscita. Riprova più tardi.",
  },
  "pt-BR": {
    vettingTitle: "Verificação",
    vettingIntro:
      "Envie um número de registro profissional ou de qualificação que possa ser consultado publicamente e a fonte da consulta. O resultado aparece aqui. Não pedimos foto de documento nem número de identidade. Só você vê esta seção.",
    nothingPublished: "Nada publicado ainda.",
    unpublishedHint:
      "No momento, só você vê esta página. Os outros só podem acessá-la depois que ela for pública, e ela se torna pública automaticamente quando você publica algo.",
    officialAssets: "Arquivos prontos oficiais",
    browseOfficialAssets: "Ver os arquivos prontos oficiais",
    dealVettingRejected:
      "Este serviço humano não passou na verificação. Você pode ver o motivo e recorrer uma vez.",
    dealVettingExpired: "A verificação expirou. Os serviços humanos relacionados voltaram a rascunho.",
    viewMyPage: "Ver minha página",
    connectedApps: "Apps que usam o seu login da OceanLeo",
    connectedAppsHint: "Veja os apps que você autorizou. Você pode revogar o acesso quando quiser.",
    grantsSignIn: "Entre para ver os apps que você autorizou",
    grantsEmpty:
      "Nenhum app fez login com a sua conta OceanLeo ainda. Quando você concordar em entrar em um app, ele aparece aqui, e você pode revogar quando quiser.",
    grantRevokeExplain: "Depois de revogar, este app vai precisar do seu ok de novo para você entrar",
    grantRevokeFailed: "Não foi possível revogar. Tente novamente mais tarde.",
  },
  "pt-PT": {
    vettingTitle: "Verificação",
    vettingIntro:
      "Envie um número de exercício profissional ou de qualificação que possa ser consultado publicamente e a fonte da consulta. O resultado aparece aqui. Não pedimos fotografias de documentos nem números de identificação. Esta secção só é visível para si.",
    nothingPublished: "Ainda não há nada publicado.",
    unpublishedHint:
      "Por agora, esta página só é visível para si. Os outros só a podem visitar depois de ser tornada pública, o que acontece automaticamente quando publicar algo.",
    officialAssets: "Ficheiros prontos oficiais",
    browseOfficialAssets: "Ver os ficheiros prontos oficiais",
    dealVettingRejected:
      "Este serviço humano não passou na verificação. Pode ver o motivo e recorrer uma vez.",
    dealVettingExpired: "A verificação expirou. Os serviços humanos relacionados voltaram a rascunho.",
    viewMyPage: "Ver a minha página",
    connectedApps: "Aplicações que usam o seu início de sessão OceanLeo",
    connectedAppsHint: "Veja as aplicações que autorizou. Pode revogar o acesso a qualquer momento.",
    grantsSignIn: "Inicie sessão para ver as aplicações que autorizou",
    grantsEmpty:
      "Nenhuma aplicação iniciou sessão com a sua conta OceanLeo até agora. Quando aceitar iniciar sessão numa aplicação, ela aparece aqui e pode revogar o acesso a qualquer momento.",
    grantRevokeExplain: "Depois de revogar, esta aplicação terá de lhe pedir novamente o acordo para iniciar sessão",
    grantRevokeFailed: "Não foi possível revogar. Tente novamente mais tarde.",
  },
  vi: {
    vettingTitle: "Kiểm tra tư cách",
    vettingIntro:
      "Gửi số hành nghề hoặc số chứng chỉ có thể tra cứu công khai và nguồn tra cứu. Kết quả sẽ hiện ở đây. Chúng tôi không nhận ảnh giấy tờ hay số căn cước. Chỉ mình bạn thấy mục này.",
    nothingPublished: "Chưa đăng gì cả.",
    unpublishedHint:
      "Hiện chỉ mình bạn thấy trang này. Công khai rồi người khác mới truy cập được; khi bạn đăng thứ gì đó, trang cũng sẽ tự động được công khai.",
    officialAssets: "Tệp có sẵn chính thức",
    browseOfficialAssets: "Xem tệp có sẵn chính thức",
    dealVettingRejected:
      "Dịch vụ người thật này không qua kiểm tra tư cách. Có thể xem lý do và khiếu nại một lần.",
    dealVettingExpired: "Kiểm tra tư cách đã hết hạn. Dịch vụ người thật liên quan trở lại bản nháp.",
    viewMyPage: "Xem trang của tôi",
    connectedApps: "Ứng dụng dùng đăng nhập OceanLeo của bạn",
    connectedAppsHint: "Xem các ứng dụng bạn đã ủy quyền. Bạn có thể thu hồi bất cứ lúc nào.",
    grantsSignIn: "Đăng nhập để xem các ứng dụng bạn đã ủy quyền",
    grantsEmpty:
      "Chưa có ứng dụng nào đăng nhập bằng tài khoản OceanLeo của bạn. Khi bạn đồng ý đăng nhập vào một ứng dụng, nó sẽ hiện ở đây và bạn có thể thu hồi bất cứ lúc nào.",
    grantRevokeExplain: "Sau khi thu hồi, ứng dụng này phải xin bạn đồng ý lại mới đăng nhập được",
    grantRevokeFailed: "Thu hồi không thành công. Vui lòng thử lại sau.",
  },
  tr: {
    vettingTitle: "Yetki kontrolü",
    vettingIntro:
      "Herkese açık biçimde doğrulanabilen bir meslek ya da yeterlilik numarası ile doğrulama kaynağını gönderin. Sonuç burada görünür. Kimlik fotoğrafı ve kimlik numarası istemiyoruz. Bu bölümü yalnızca siz görürsünüz.",
    nothingPublished: "Henüz yayımlanmış bir şey yok.",
    unpublishedHint:
      "Bu sayfayı şu anda yalnızca siz görebiliyorsunuz. Herkese açıldıktan sonra başkaları da ziyaret edebilir; bir şey yayımladığınızda sayfa kendiliğinden herkese açılır.",
    officialAssets: "Resmi hazır dosyalar",
    browseOfficialAssets: "Resmi hazır dosyalara bak",
    dealVettingRejected:
      "Bu insan hizmeti yetki kontrolünden geçmedi. Gerekçeyi görüp bir kez itiraz edebilirsiniz.",
    dealVettingExpired: "Yetki kontrolü süresi doldu. İlgili insan hizmetleri taslağa alındı.",
    viewMyPage: "Sayfamı gör",
    connectedApps: "OceanLeo hesabınızla oturum açan uygulamalar",
    connectedAppsHint: "Yetki verdiğiniz uygulamaları görün. Yetkiyi istediğiniz zaman geri alabilirsiniz.",
    grantsSignIn: "Yetki verdiğiniz uygulamaları görmek için oturum açın",
    grantsEmpty:
      "Henüz hiçbir uygulama OceanLeo hesabınızla oturum açmadı. Bir uygulamada oturum açmayı onayladığınızda burada görünür ve istediğiniz zaman yetkiyi geri alabilirsiniz.",
    grantRevokeExplain: "Geri aldıktan sonra bu uygulama yeniden onayınızı istemeden oturum açamaz",
    grantRevokeFailed: "Geri alınamadı. Lütfen daha sonra tekrar deneyin.",
  },
  "zh-TW": {
    vettingTitle: "資質核驗",
    vettingIntro:
      "提交可公開查驗的執業或資格編號和查驗來源，核驗結果會顯示在這裡。不收證件照片和身分證號；這一塊只有你自己看得到。",
    nothingPublished: "還沒有發布任何東西。",
    unpublishedHint: "這張主頁現在只有你自己看得到。公開之後別人才能造訪，發布東西時也會自動公開。",
    officialAssets: "官方現成檔案",
    browseOfficialAssets: "逛官方現成檔案",
    dealVettingRejected: "這條人工服務沒有通過資質核驗，可以查看理由並申訴一次。",
    dealVettingExpired: "資質核驗已到期，相關人工服務已轉回草稿。",
    viewMyPage: "查看我的主頁",
    connectedApps: "用 OceanLeo 帳號登入的應用",
    connectedAppsHint: "查看你授權過的應用，隨時可以撤回。",
    grantsSignIn: "登入後查看你授權過的應用",
    grantsEmpty: "還沒有應用用你的 OceanLeo 帳號登入過。你在某個應用裡同意登入後，它會出現在這裡，隨時可以撤回。",
    grantRevokeExplain: "撤回後這個應用要再讓你同意一次才能登入",
    grantRevokeFailed: "沒撤回成功，請稍後再試。",
  },
  ja: {
    vettingTitle: "資格確認",
    vettingIntro:
      "公開で確認できる業務登録番号または資格番号と、確認元を提出してください。結果はここに表示されます。身分証の写真や身分証番号は受け付けません。この欄はご自身にだけ表示されます。",
    nothingPublished: "公開されているものはまだありません。",
    unpublishedHint:
      "このページは今、自分にしか見えません。公開すると他の人もアクセスでき、何かを公開したときにも自動的に公開されます。",
    officialAssets: "公式の既成ファイル",
    browseOfficialAssets: "公式の既成ファイルを見る",
    dealVettingRejected:
      "この人によるサービスは資格確認を通りませんでした。理由を見て一度申し立てできます。",
    dealVettingExpired: "資格確認の期限が切れ、関連する人によるサービスは下書きに戻りました。",
    viewMyPage: "マイページを見る",
    connectedApps: "OceanLeo アカウントでログインするアプリ",
    connectedAppsHint: "認可したアプリを確認できます。いつでも取り消せます。",
    grantsSignIn: "ログインすると、認可したアプリを確認できます",
    grantsEmpty:
      "OceanLeo アカウントでログインしたアプリはまだありません。アプリでログインに同意すると、ここに表示され、いつでも取り消せます。",
    grantRevokeExplain: "取り消すと、このアプリはもう一度同意を得ないとログインできません",
    grantRevokeFailed: "取り消せませんでした。しばらくしてからもう一度お試しください。",
  },
  ko: {
    vettingTitle: "자격 확인",
    vettingIntro:
      "공개적으로 확인할 수 있는 자격·등록 번호와 확인 출처를 제출하세요. 결과는 여기에 표시됩니다. 신분증 사진과 신분증 번호는 받지 않습니다. 이 영역은 본인에게만 보입니다.",
    nothingPublished: "아직 게시된 것이 없습니다.",
    unpublishedHint:
      "이 페이지는 지금 나만 볼 수 있습니다. 공개하면 다른 사람도 방문할 수 있고, 무언가를 게시하면 자동으로 공개됩니다.",
    officialAssets: "공식 기성 파일",
    browseOfficialAssets: "공식 기성 파일 둘러보기",
    dealVettingRejected:
      "이 사람 서비스는 자격 확인을 통과하지 못했습니다. 이유를 보고 한 번 이의 신청할 수 있습니다.",
    dealVettingExpired: "자격 확인이 만료되어 관련 사람 서비스가 초안으로 돌아갔습니다.",
    viewMyPage: "내 페이지 보기",
    connectedApps: "OceanLeo 계정으로 로그인하는 앱",
    connectedAppsHint: "인가한 앱을 확인하세요. 언제든 철회할 수 있습니다.",
    grantsSignIn: "로그인한 뒤 인가한 앱을 보세요",
    grantsEmpty:
      "아직 OceanLeo 계정으로 로그인한 앱이 없습니다. 앱에서 로그인에 동의하면 여기에 표시되고, 언제든 철회할 수 있습니다.",
    grantRevokeExplain: "철회하면 이 앱은 다시 동의를 받아야 로그인할 수 있습니다",
    grantRevokeFailed: "철회하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
  ar: {
    vettingTitle: "التحقق من الأهلية",
    vettingIntro:
      "قدّم رقم ممارسة المهنة أو المؤهل القابل للتحقق منه علنًا ومصدر التحقق. ستظهر النتيجة هنا. لا نطلب صور الهوية ولا أرقامها. هذا القسم ظاهر لك وحدك.",
    nothingPublished: "لم يُنشر أي شيء بعد.",
    unpublishedHint:
      "هذه الصفحة لا يراها الآن سواك. لن يتمكن الآخرون من زيارتها إلا بعد نشرها، وتصبح عامة تلقائيًا عند نشر أي شيء.",
    officialAssets: "ملفات رسمية جاهزة",
    browseOfficialAssets: "تصفح الملفات الرسمية الجاهزة",
    dealVettingRejected: "لم تجتز هذه الخدمة البشرية التحقق. يمكنك قراءة السبب والتظلم مرة واحدة.",
    dealVettingExpired: "انتهت صلاحية التحقق. أُعيدت الخدمات البشرية ذات الصلة إلى المسودة.",
    viewMyPage: "عرض صفحتي",
    connectedApps: "التطبيقات التي تستخدم تسجيل دخول OceanLeo",
    connectedAppsHint: "اطّلع على التطبيقات التي فوّضتها. يمكنك سحب التفويض في أي وقت.",
    grantsSignIn: "سجّل الدخول لرؤية التطبيقات التي فوّضتها",
    grantsEmpty:
      "لم يسجّل أي تطبيق دخولك بحساب OceanLeo بعد. عندما توافق على تسجيل الدخول في تطبيق ما سيظهر هنا، ويمكنك سحب التفويض في أي وقت.",
    grantRevokeExplain: "بعد السحب سيحتاج هذا التطبيق إلى موافقتك مرة أخرى قبل تسجيل الدخول",
    grantRevokeFailed: "تعذّر سحب التفويض. حاول مرة أخرى لاحقًا.",
  },
  th: {
    vettingTitle: "การตรวจคุณสมบัติ",
    vettingIntro:
      "ส่งหมายเลขใบอนุญาตประกอบวิชาชีพหรือหมายเลขคุณวุฒิที่ตรวจสอบได้ต่อสาธารณะ พร้อมแหล่งที่ใช้ตรวจสอบ ผลจะแสดงที่นี่ เราไม่รับรูปบัตรหรือเลขบัตรประจำตัว ส่วนนี้มองเห็นได้เฉพาะคุณเท่านั้น",
    nothingPublished: "ยังไม่มีอะไรที่เผยแพร่",
    unpublishedHint:
      "ตอนนี้มีแค่คุณที่เห็นหน้านี้ คนอื่นจะเข้าชมได้เมื่อเปิดเป็นสาธารณะแล้ว และเมื่อคุณเผยแพร่อะไรสักอย่าง หน้านี้จะเปิดเป็นสาธารณะโดยอัตโนมัติ",
    officialAssets: "ไฟล์สำเร็จรูปทางการ",
    browseOfficialAssets: "ดูไฟล์สำเร็จรูปทางการ",
    dealVettingRejected: "บริการโดยคนนี้ไม่ผ่านการตรวจคุณสมบัติ อ่านเหตุผลและอุทธรณ์ได้ครั้งเดียว",
    dealVettingExpired: "การตรวจคุณสมบัติหมดอายุ บริการโดยคนที่เกี่ยวข้องกลับเป็นฉบับร่าง",
    viewMyPage: "ดูหน้าของฉัน",
    connectedApps: "แอปที่ใช้บัญชี OceanLeo เข้าสู่ระบบ",
    connectedAppsHint: "ดูแอปที่คุณอนุญาตไว้ และถอนการอนุญาตได้ทุกเมื่อ",
    grantsSignIn: "เข้าสู่ระบบเพื่อดูแอปที่คุณอนุญาตไว้",
    grantsEmpty:
      "ยังไม่มีแอปใดให้คุณเข้าสู่ระบบด้วยบัญชี OceanLeo เมื่อคุณยินยอมให้เข้าสู่ระบบในแอปใดแล้ว แอปนั้นจะปรากฏที่นี่ และคุณถอนการอนุญาตได้ทุกเมื่อ",
    grantRevokeExplain: "เมื่อถอนแล้ว แอปนี้ต้องให้คุณยินยอมอีกครั้งก่อนเข้าสู่ระบบได้",
    grantRevokeFailed: "ถอนการอนุญาตไม่สำเร็จ โปรดลองอีกครั้งภายหลัง",
  },
  hi: {
    vettingTitle: "योग्यता जाँच",
    vettingIntro:
      "सार्वजनिक रूप से जाँचा जा सकने वाला पेशेवर पंजीकरण या योग्यता नंबर और जाँच का स्रोत जमा करें। नतीजा यहीं दिखेगा। हम पहचान-पत्र की फ़ोटो या पहचान-पत्र का नंबर नहीं लेते। यह हिस्सा सिर्फ़ आपको दिखता है।",
    nothingPublished: "अभी कुछ भी प्रकाशित नहीं हुआ है।",
    unpublishedHint:
      "अभी इस पेज को सिर्फ़ आप देख सकते हैं। सार्वजनिक होने के बाद ही दूसरे इसे खोल पाएँगे, और आप कुछ भी प्रकाशित करेंगे तो यह अपने-आप सार्वजनिक हो जाएगा।",
    officialAssets: "आधिकारिक तैयार फ़ाइलें",
    browseOfficialAssets: "आधिकारिक तैयार फ़ाइलें देखें",
    dealVettingRejected: "यह मानव सेवा योग्यता जाँच में नहीं उतरी। कारण देखकर एक बार अपील कर सकते हैं।",
    dealVettingExpired: "योग्यता जाँच खत्म हुई। संबंधित मानव सेवाएँ ड्राफ्ट पर वापस गईं।",
    viewMyPage: "मेरा पेज देखें",
    connectedApps: "OceanLeo खाते से साइन इन करने वाले ऐप",
    connectedAppsHint: "देखें कि आपने किन ऐप को अनुमति दी है। आप कभी भी अनुमति वापस ले सकते हैं।",
    grantsSignIn: "जिन ऐप को आपने अनुमति दी है उन्हें देखने के लिए साइन इन करें",
    grantsEmpty:
      "अभी तक किसी ऐप ने आपको OceanLeo खाते से साइन इन नहीं कराया है। किसी ऐप में साइन इन के लिए सहमति देने पर वह यहाँ दिखेगा, और आप कभी भी अनुमति वापस ले सकते हैं।",
    grantRevokeExplain: "वापस लेने के बाद इस ऐप को फिर से आपकी सहमति चाहिए तब साइन इन होगा",
    grantRevokeFailed: "अनुमति वापस नहीं ली जा सकी। कृपया कुछ देर बाद फिर कोशिश करें।",
  },
});
