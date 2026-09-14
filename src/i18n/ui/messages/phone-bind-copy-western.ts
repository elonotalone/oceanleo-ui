import type { PhoneBindCopyMessages } from "./phone-bind-copy-base";

export const PHONE_BIND_COPY_WESTERN: Record<
  "de" | "en" | "es" | "es-419" | "fr" | "it" | "pt-BR" | "pt-PT" | "vi" | "tr",
  PhoneBindCopyMessages
> = {
  en: {
    bindTitle: "Bind a mobile number",
    bindIntro:
      "On the China edition, this account must have a verified Chinese mainland mobile number bound before you can continue.",
    verifyAndBind: "Verify and bind",
    bindSuccess: "The mobile number is now bound to this account.",
    sectionDesc:
      "China-edition accounts must bind a verified Chinese mainland mobile number.",
    boundAs: "Current number {phone}",
    changePhone: "Change number",
    changeIntro:
      "To change the number, verify the current one first, then the new one. Each step sends an SMS.",
    verifyCurrent: "Verify current number",
    currentVerified:
      "The current number is verified. Enter a new Chinese mainland mobile number.",
    phoneChanged: "The mobile number has been changed.",
    lostPhoneTitle: "Lost access to this number?",
    lostPhoneBody:
      "If you lost the phone or cannot receive SMS, write to support@oceanleo.com. We will verify your identity and help you change the number.",
    smsUnconfigured: "SMS is not configured yet. Please try again later.",
  },
  de: {
    bindTitle: "Handynummer binden",
    bindIntro:
      "In der China-Ausgabe muss dieses Konto eine verifizierte Mobilnummer aus Festlandchina gebunden haben, bevor Sie fortfahren können.",
    verifyAndBind: "Prüfen und binden",
    bindSuccess: "Die Handynummer ist jetzt an dieses Konto gebunden.",
    sectionDesc:
      "Konten der China-Ausgabe müssen eine verifizierte Mobilnummer aus Festlandchina binden.",
    boundAs: "Aktuelle Nummer {phone}",
    changePhone: "Nummer wechseln",
    changeIntro:
      "Zum Wechseln zuerst die aktuelle Nummer prüfen, dann die neue. Jeder Schritt sendet eine SMS.",
    verifyCurrent: "Aktuelle Nummer prüfen",
    currentVerified:
      "Die aktuelle Nummer ist geprüft. Geben Sie eine neue Mobilnummer aus Festlandchina ein.",
    phoneChanged: "Die Handynummer wurde gewechselt.",
    lostPhoneTitle: "Kein Zugang zu dieser Nummer?",
    lostPhoneBody:
      "Wenn das Handy weg ist oder keine SMS ankommt, schreiben Sie an support@oceanleo.com. Wir prüfen Ihre Identität und helfen beim Wechsel.",
    smsUnconfigured: "SMS ist noch nicht eingerichtet. Bitte später erneut versuchen.",
  },
  fr: {
    bindTitle: "Lier un numéro de mobile",
    bindIntro:
      "Sur l’édition Chine, ce compte doit avoir un numéro mobile de Chine continentale vérifié avant de continuer.",
    verifyAndBind: "Vérifier et lier",
    bindSuccess: "Le numéro de mobile est maintenant lié à ce compte.",
    sectionDesc:
      "Les comptes de l’édition Chine doivent lier un numéro mobile vérifié de Chine continentale.",
    boundAs: "Numéro actuel {phone}",
    changePhone: "Changer de numéro",
    changeIntro:
      "Pour changer de numéro, vérifiez d’abord l’actuel, puis le nouveau. Chaque étape envoie un SMS.",
    verifyCurrent: "Vérifier le numéro actuel",
    currentVerified:
      "Le numéro actuel est vérifié. Saisissez un nouveau numéro mobile de Chine continentale.",
    phoneChanged: "Le numéro de mobile a été changé.",
    lostPhoneTitle: "Plus accès à ce numéro ?",
    lostPhoneBody:
      "Si le téléphone est perdu ou ne reçoit plus de SMS, écrivez à support@oceanleo.com. Nous vérifierons votre identité et vous aiderons à changer le numéro.",
    smsUnconfigured: "Le SMS n’est pas encore configuré. Réessayez plus tard.",
  },
  es: {
    bindTitle: "Vincular un número de móvil",
    bindIntro:
      "En la edición de China, esta cuenta debe tener un número móvil de China continental verificado antes de continuar.",
    verifyAndBind: "Verificar y vincular",
    bindSuccess: "El número de móvil ya está vinculado a esta cuenta.",
    sectionDesc:
      "Las cuentas de la edición de China deben vincular un número móvil verificado de China continental.",
    boundAs: "Número actual {phone}",
    changePhone: "Cambiar número",
    changeIntro:
      "Para cambiar el número, verifica primero el actual y luego el nuevo. Cada paso envía un SMS.",
    verifyCurrent: "Verificar el número actual",
    currentVerified:
      "El número actual está verificado. Introduce un nuevo número móvil de China continental.",
    phoneChanged: "El número de móvil se ha cambiado.",
    lostPhoneTitle: "¿Sin acceso a este número?",
    lostPhoneBody:
      "Si perdiste el teléfono o no puedes recibir SMS, escribe a support@oceanleo.com. Comprobaremos tu identidad y te ayudaremos a cambiar el número.",
    smsUnconfigured: "El SMS aún no está configurado. Inténtalo más tarde.",
  },
  "es-419": {
    bindTitle: "Vincular un número de celular",
    bindIntro:
      "En la edición de China, esta cuenta debe tener un número de celular de China continental verificado antes de seguir.",
    verifyAndBind: "Verificar y vincular",
    bindSuccess: "El número de celular ya está vinculado a esta cuenta.",
    sectionDesc:
      "Las cuentas de la edición de China deben vincular un número de celular verificado de China continental.",
    boundAs: "Número actual {phone}",
    changePhone: "Cambiar número",
    changeIntro:
      "Para cambiar el número, verificá primero el actual y después el nuevo. Cada paso envía un SMS.",
    verifyCurrent: "Verificar el número actual",
    currentVerified:
      "El número actual está verificado. Ingresá un número de celular nuevo de China continental.",
    phoneChanged: "El número de celular se cambió.",
    lostPhoneTitle: "¿Sin acceso a este número?",
    lostPhoneBody:
      "Si perdiste el teléfono o no podés recibir SMS, escribí a support@oceanleo.com. Vamos a verificar tu identidad y te ayudamos a cambiar el número.",
    smsUnconfigured: "El SMS todavía no está configurado. Probá de nuevo más tarde.",
  },
  it: {
    bindTitle: "Collega un numero di cellulare",
    bindIntro:
      "Nell’edizione Cina questo account deve avere un numero di cellulare della Cina continentale verificato prima di continuare.",
    verifyAndBind: "Verifica e collega",
    bindSuccess: "Il numero di cellulare è ora collegato a questo account.",
    sectionDesc:
      "Gli account dell’edizione Cina devono collegare un numero di cellulare verificato della Cina continentale.",
    boundAs: "Numero attuale {phone}",
    changePhone: "Cambia numero",
    changeIntro:
      "Per cambiare numero verifica prima quello attuale, poi il nuovo. Ogni passaggio invia un SMS.",
    verifyCurrent: "Verifica il numero attuale",
    currentVerified:
      "Il numero attuale è verificato. Inserisci un nuovo numero di cellulare della Cina continentale.",
    phoneChanged: "Il numero di cellulare è stato cambiato.",
    lostPhoneTitle: "Hai perso l’accesso a questo numero?",
    lostPhoneBody:
      "Se hai perso il telefono o non ricevi SMS, scrivi a support@oceanleo.com. Verificheremo la tua identità e ti aiuteremo a cambiare il numero.",
    smsUnconfigured: "Gli SMS non sono ancora configurati. Riprova più tardi.",
  },
  "pt-BR": {
    bindTitle: "Vincular um número de celular",
    bindIntro:
      "Na edição da China, esta conta precisa ter um número de celular da China continental verificado antes de continuar.",
    verifyAndBind: "Verificar e vincular",
    bindSuccess: "O número de celular agora está vinculado a esta conta.",
    sectionDesc:
      "Contas da edição da China devem vincular um número de celular verificado da China continental.",
    boundAs: "Número atual {phone}",
    changePhone: "Trocar número",
    changeIntro:
      "Para trocar o número, verifique primeiro o atual e depois o novo. Cada etapa envia um SMS.",
    verifyCurrent: "Verificar o número atual",
    currentVerified:
      "O número atual está verificado. Digite um novo número de celular da China continental.",
    phoneChanged: "O número de celular foi trocado.",
    lostPhoneTitle: "Perdeu o acesso a este número?",
    lostPhoneBody:
      "Se o celular foi perdido ou não recebe SMS, escreva para support@oceanleo.com. Vamos verificar sua identidade e ajudar a trocar o número.",
    smsUnconfigured: "O SMS ainda não está configurado. Tente de novo mais tarde.",
  },
  "pt-PT": {
    bindTitle: "Associar um número de telemóvel",
    bindIntro:
      "Na edição da China, esta conta tem de ter um número de telemóvel da China continental verificado antes de continuar.",
    verifyAndBind: "Verificar e associar",
    bindSuccess: "O número de telemóvel está agora associado a esta conta.",
    sectionDesc:
      "As contas da edição da China têm de associar um número de telemóvel verificado da China continental.",
    boundAs: "Número atual {phone}",
    changePhone: "Alterar número",
    changeIntro:
      "Para alterar o número, verifique primeiro o atual e depois o novo. Cada passo envia um SMS.",
    verifyCurrent: "Verificar o número atual",
    currentVerified:
      "O número atual está verificado. Introduza um novo número de telemóvel da China continental.",
    phoneChanged: "O número de telemóvel foi alterado.",
    lostPhoneTitle: "Perdeu o acesso a este número?",
    lostPhoneBody:
      "Se perdeu o telemóvel ou não recebe SMS, escreva para support@oceanleo.com. Verificaremos a sua identidade e ajudaremos a alterar o número.",
    smsUnconfigured: "O SMS ainda não está configurado. Tente novamente mais tarde.",
  },
  vi: {
    bindTitle: "Liên kết số điện thoại",
    bindIntro:
      "Trên phiên bản Trung Quốc, tài khoản này phải có số di động Trung Quốc đại lục đã xác minh trước khi tiếp tục.",
    verifyAndBind: "Xác minh và liên kết",
    bindSuccess: "Số điện thoại đã được liên kết với tài khoản này.",
    sectionDesc:
      "Tài khoản phiên bản Trung Quốc phải liên kết một số di động Trung Quốc đại lục đã xác minh.",
    boundAs: "Số hiện tại {phone}",
    changePhone: "Đổi số",
    changeIntro:
      "Để đổi số, hãy xác minh số hiện tại trước, rồi số mới. Mỗi bước đều gửi SMS.",
    verifyCurrent: "Xác minh số hiện tại",
    currentVerified:
      "Số hiện tại đã được xác minh. Hãy nhập số di động Trung Quốc đại lục mới.",
    phoneChanged: "Số điện thoại đã được đổi.",
    lostPhoneTitle: "Mất quyền dùng số này?",
    lostPhoneBody:
      "Nếu mất máy hoặc không nhận được SMS, hãy viết thư tới support@oceanleo.com. Chúng tôi sẽ xác minh danh tính và giúp bạn đổi số.",
    smsUnconfigured: "SMS chưa được cấu hình. Vui lòng thử lại sau.",
  },
  tr: {
    bindTitle: "Cep numarası bağla",
    bindIntro:
      "Çin sürümünde devam etmeden önce bu hesaba doğrulanmış bir Çin anakarası cep numarası bağlı olmalıdır.",
    verifyAndBind: "Doğrula ve bağla",
    bindSuccess: "Cep numarası artık bu hesaba bağlı.",
    sectionDesc:
      "Çin sürümü hesapları doğrulanmış bir Çin anakarası cep numarası bağlamalıdır.",
    boundAs: "Geçerli numara {phone}",
    changePhone: "Numarayı değiştir",
    changeIntro:
      "Numarayı değiştirmek için önce geçerli numarayı, sonra yenisini doğrulayın. Her adım SMS gönderir.",
    verifyCurrent: "Geçerli numarayı doğrula",
    currentVerified:
      "Geçerli numara doğrulandı. Yeni bir Çin anakarası cep numarası girin.",
    phoneChanged: "Cep numarası değiştirildi.",
    lostPhoneTitle: "Bu numaraya erişiminiz yok mu?",
    lostPhoneBody:
      "Telefon kaybolduysa veya SMS gelmiyorsa support@oceanleo.com adresine yazın. Kimliğinizi doğrulayıp numarayı değiştirmenize yardımcı oluruz.",
    smsUnconfigured: "SMS henüz yapılandırılmadı. Lütfen sonra yeniden deneyin.",
  },
};
