import type { PhoneBindCopyMessages } from "./phone-bind-copy-base";

export const PHONE_BIND_COPY_EASTERN: Record<
  "ja" | "ko" | "zh-TW" | "ar" | "th" | "hi",
  PhoneBindCopyMessages
> = {
  ja: {
    bindTitle: "携帯電話番号を登録",
    bindIntro:
      "中国版では、確認済みの中国本土の携帯番号をこのアカウントに登録してからでないと続けられません。",
    verifyAndBind: "確認して登録",
    bindSuccess: "携帯番号をこのアカウントに登録しました。",
    sectionDesc: "中国版のアカウントは、確認済みの中国本土の携帯番号を登録する必要があります。",
    boundAs: "現在の番号 {phone}",
    changePhone: "番号を変更",
    changeIntro:
      "番号を変更するには、先に現在の番号を確認し、次に新しい番号を確認します。どちらもSMSが届きます。",
    verifyCurrent: "現在の番号を確認",
    currentVerified: "現在の番号を確認しました。新しい中国本土の携帯番号を入力してください。",
    phoneChanged: "携帯番号を変更しました。",
    lostPhoneTitle: "この番号が使えなくなったら",
    lostPhoneBody:
      "端末を失くした、またはSMSを受け取れない場合は support@oceanleo.com までご連絡ください。本人確認のうえ、番号の変更をお手伝いします。",
    smsUnconfigured: "SMSはまだ設定されていません。しばらくしてからやり直してください。",
  },
  ko: {
    bindTitle: "휴대폰 번호 연결",
    bindIntro:
      "중국판에서는 인증된 중국 본토 휴대폰 번호를 이 계정에 연결해야 계속할 수 있습니다.",
    verifyAndBind: "확인하고 연결",
    bindSuccess: "휴대폰 번호가 이 계정에 연결되었습니다.",
    sectionDesc: "중국판 계정은 인증된 중국 본토 휴대폰 번호를 연결해야 합니다.",
    boundAs: "현재 번호 {phone}",
    changePhone: "번호 변경",
    changeIntro:
      "번호를 바꾸려면 먼저 현재 번호를 확인한 뒤 새 번호를 확인합니다. 각 단계마다 문자가 발송됩니다.",
    verifyCurrent: "현재 번호 확인",
    currentVerified: "현재 번호가 확인되었습니다. 새 중국 본토 휴대폰 번호를 입력하세요.",
    phoneChanged: "휴대폰 번호가 변경되었습니다.",
    lostPhoneTitle: "이 번호를 쓸 수 없다면",
    lostPhoneBody:
      "휴대폰을 잃었거나 문자를 받을 수 없으면 support@oceanleo.com 으로 메일 주세요. 신원을 확인한 뒤 번호 변경을 도와 드립니다.",
    smsUnconfigured: "문자 서비스가 아직 설정되지 않았습니다. 나중에 다시 시도해 주세요.",
  },
  "zh-TW": {
    bindTitle: "綁定手機號碼",
    bindIntro: "國內版必須把一個已驗證的中國大陸手機號碼綁在目前帳號上，才能繼續使用。",
    verifyAndBind: "驗證並綁定",
    bindSuccess: "手機號碼已經綁到目前帳號。",
    sectionDesc: "國內版帳號必須綁一個已驗證的中國大陸手機號碼。",
    boundAs: "目前號碼 {phone}",
    changePhone: "換綁",
    changeIntro: "換綁要先驗證目前號碼，再驗證新號碼。兩輪都會寄簡訊。",
    verifyCurrent: "驗證目前號碼",
    currentVerified: "目前號碼已驗證。請輸入新的中國大陸手機號碼。",
    phoneChanged: "手機號碼已經換綁。",
    lostPhoneTitle: "手機號碼沒了怎麼辦",
    lostPhoneBody:
      "手機丟了或者收不到簡訊，請寫信到 support@oceanleo.com，我們人工核實身分之後幫你換綁。",
    smsUnconfigured: "簡訊服務尚未設定，請稍後再試。",
  },
  ar: {
    bindTitle: "ربط رقم جوّال",
    bindIntro:
      "في نسخة الصين يجب ربط رقم جوّال موثّق من البر الرئيسي للصين بهذا الحساب قبل المتابعة.",
    verifyAndBind: "تحقق واربط",
    bindSuccess: "تم ربط رقم الجوّال بهذا الحساب.",
    sectionDesc:
      "حسابات نسخة الصين يجب أن تربط رقم جوّال موثّق من البر الرئيسي للصين.",
    boundAs: "الرقم الحالي {phone}",
    changePhone: "تغيير الرقم",
    changeIntro:
      "لتغيير الرقم تحقق أولاً من الرقم الحالي ثم من الرقم الجديد. كل خطوة ترسل رسالة SMS.",
    verifyCurrent: "تحقق من الرقم الحالي",
    currentVerified:
      "تم التحقق من الرقم الحالي. أدخل رقم جوّال جديداً من البر الرئيسي للصين.",
    phoneChanged: "تم تغيير رقم الجوّال.",
    lostPhoneTitle: "فقدت هذا الرقم؟",
    lostPhoneBody:
      "إذا فقدت الهاتف أو تعذّر استلام الرسائل، راسل support@oceanleo.com. سنتحقق من هويتك ونساعدك على تغيير الرقم.",
    smsUnconfigured: "خدمة الرسائل غير مهيأة بعد. حاول لاحقاً.",
  },
  th: {
    bindTitle: "ผูกเบอร์มือถือ",
    bindIntro:
      "ในรุ่นจีน บัญชีนี้ต้องผูกเบอร์มือถือจีนแผ่นดินใหญ่ที่ยืนยันแล้วก่อนใช้งานต่อ",
    verifyAndBind: "ยืนยันแล้วผูก",
    bindSuccess: "ผูกเบอร์มือถือกับบัญชีนี้แล้ว",
    sectionDesc: "บัญชีรุ่นจีนต้องผูกเบอร์มือถือจีนแผ่นดินใหญ่ที่ยืนยันแล้ว",
    boundAs: "เบอร์ปัจจุบัน {phone}",
    changePhone: "เปลี่ยนเบอร์",
    changeIntro:
      "การเปลี่ยนเบอร์ต้องยืนยันเบอร์ปัจจุบันก่อน แล้วค่อยยืนยันเบอร์ใหม่ แต่ละขั้นจะส่ง SMS",
    verifyCurrent: "ยืนยันเบอร์ปัจจุบัน",
    currentVerified: "ยืนยันเบอร์ปัจจุบันแล้ว กรอกเบอร์มือถือจีนแผ่นดินใหญ่เบอร์ใหม่",
    phoneChanged: "เปลี่ยนเบอร์มือถือแล้ว",
    lostPhoneTitle: "ใช้เบอร์นี้ไม่ได้แล้ว?",
    lostPhoneBody:
      "ถ้าทำมือถือหายหรือรับ SMS ไม่ได้ ให้เขียนถึง support@oceanleo.com เราจะตรวจตัวตนแล้วช่วยเปลี่ยนเบอร์",
    smsUnconfigured: "ยังไม่ได้ตั้งค่า SMS กรุณาลองใหม่ภายหลัง",
  },
  hi: {
    bindTitle: "मोबाइल नंबर बाँधें",
    bindIntro:
      "चीन संस्करण पर आगे बढ़ने से पहले इस खाते से मुख्य भूमि चीन का सत्यापित मोबाइल नंबर जुड़ा होना चाहिए।",
    verifyAndBind: "सत्यापित कर बाँधें",
    bindSuccess: "मोबाइल नंबर अब इस खाते से जुड़ गया है।",
    sectionDesc:
      "चीन संस्करण के खातों को मुख्य भूमि चीन का सत्यापित मोबाइल नंबर बाँधना होगा।",
    boundAs: "वर्तमान नंबर {phone}",
    changePhone: "नंबर बदलें",
    changeIntro:
      "नंबर बदलने के लिए पहले वर्तमान नंबर सत्यापित करें, फिर नया। हर चरण पर SMS जाता है।",
    verifyCurrent: "वर्तमान नंबर सत्यापित करें",
    currentVerified:
      "वर्तमान नंबर सत्यापित हो गया। नया मुख्य भूमि चीन मोबाइल नंबर दर्ज करें।",
    phoneChanged: "मोबाइल नंबर बदल दिया गया है।",
    lostPhoneTitle: "यह नंबर इस्तेमाल नहीं हो पा रहा?",
    lostPhoneBody:
      "फ़ोन खो गया हो या SMS न आ रहा हो तो support@oceanleo.com पर लिखें। हम पहचान जाँच कर नंबर बदलने में मदद करेंगे।",
    smsUnconfigured: "SMS अभी सेट नहीं है। बाद में फिर कोशिश करें।",
  },
};
