// BYOK 设置页文案 —— 东亚、南亚与阿拉伯语译文。
// key 的语义与原文见 ./byok-copy-base.ts。
// 阿拉伯语是 RTL：句子按 RTL 写，渲染时由浏览器定序。

import type { ByokCopyMessages } from "./byok-copy-base";

export const BYOK_COPY_EASTERN = {
  "zh-TW": {
    storageNotice:
      "你的 key 只以加密形式保存在這台裝置的瀏覽器裡，OceanLeo 伺服器不保存；每次呼叫隨請求經過 OceanLeo 閘道轉發給廠商，閘道用完即棄、不記錄。換裝置需重填，清除網站資料會遺失。",
    storageBrowserOnly:
      "金鑰只以加密形式保存在你這台裝置的瀏覽器裡，OceanLeo 伺服器不保存。",
    compatBadge: "僅支援 OpenAI 相容協議 API",
    endpointUrl: "介面位址",
    pasteVendorKey: "貼上廠商 API Key",
    getFromConsole: "去廠商控制台取得 →",
    bailianCodingPlan:
      "百煉 Coding Plan（sk-sp- 開頭）的 key 禁止用於應用後端，不能在此使用。",
    modelName: "模型名稱",
    probe: "探測",
    probeFailed: "探測失敗",
    modelPlaceholder: "例如 gpt-4o；留空用廠商預設",
    capability: "能力",
    capTools: "工具呼叫",
    capVision: "圖片輸入",
    capReasoning: "推理模式",
    toolsHint:
      "勾選「工具呼叫」後可用於智慧體任務；未勾選時智慧體會明確報錯。",
    configuredProviders: "已設定的廠商",
    providerDefault: "廠商預設",
    gatewayNotEnabled: "閘道尚未啟用 BYOK，請稍後再試。",
    loginToConfigure: "登入後即可設定自己的 key",
  },
  ja: {
    storageNotice:
      "キーはこの端末のブラウザに暗号化して保存されるだけです。OceanLeo のサーバーは保存しません。呼び出しのたびに OceanLeo ゲートウェイ経由でベンダーへ渡り、ゲートウェイは使い終わったら破棄し記録しません。別の端末では再入力が必要で、サイトデータを消すと失われます。",
    storageBrowserOnly:
      "キーはこの端末のブラウザに暗号化して保存されるだけです。OceanLeo のサーバーは保存しません。",
    compatBadge: "OpenAI 互換プロトコル API のみ",
    endpointUrl: "エンドポイント",
    pasteVendorKey: "ベンダーの API Key を貼り付け",
    getFromConsole: "ベンダーのコンソールで取得 →",
    bailianCodingPlan:
      "百錬 Coding Plan（sk-sp- で始まる）のキーはアプリバックエンドに使えず、ここでも使えません。",
    modelName: "モデル名",
    probe: "検出",
    probeFailed: "検出に失敗しました。",
    modelPlaceholder: "例: gpt-4o。空欄ならベンダー既定",
    capability: "能力",
    capTools: "ツール呼び出し",
    capVision: "画像入力",
    capReasoning: "推論モード",
    toolsHint:
      "「ツール呼び出し」を選ぶとエージェント作業に使えます。外すとエージェントは明確にエラーを返します。",
    configuredProviders: "設定済みのベンダー",
    providerDefault: "ベンダー既定",
    gatewayNotEnabled: "ゲートウェイはまだ BYOK を有効にしていません。しばらくしてからやり直してください。",
    loginToConfigure: "ログインすると自分のキーを設定できます",
  },
  ko: {
    storageNotice:
      "키는 이 기기의 브라우저에만 암호화되어 저장됩니다. OceanLeo 서버는 보관하지 않습니다. 호출마다 OceanLeo 게이트웨이를 거쳐 공급사로 전달되며, 게이트웨이는 사용한 뒤 버리고 기록하지 않습니다. 다른 기기에서는 다시 입력해야 하고, 사이트 데이터를 지우면 사라집니다.",
    storageBrowserOnly:
      "키는 이 기기의 브라우저에만 암호화되어 저장됩니다. OceanLeo 서버는 보관하지 않습니다.",
    compatBadge: "OpenAI 호환 프로토콜 API만 지원",
    endpointUrl: "엔드포인트 주소",
    pasteVendorKey: "공급사 API Key를 붙여넣기",
    getFromConsole: "공급사 콘솔에서 받기 →",
    bailianCodingPlan:
      "바이리엔 Coding Plan(sk-sp-로 시작) 키는 앱 백엔드에 쓸 수 없으며 여기에서도 사용할 수 없습니다.",
    modelName: "모델 이름",
    probe: "탐지",
    probeFailed: "탐지에 실패했습니다.",
    modelPlaceholder: "예: gpt-4o. 비우면 공급사 기본값",
    capability: "능력",
    capTools: "도구 호출",
    capVision: "이미지 입력",
    capReasoning: "추론 모드",
    toolsHint:
      "「도구 호출」을 선택하면 에이전트 작업에 쓸 수 있습니다. 선택하지 않으면 에이전트가 분명한 오류를 냅니다.",
    configuredProviders: "설정한 공급사",
    providerDefault: "공급사 기본값",
    gatewayNotEnabled: "게이트웨이가 아직 BYOK를 켜지 않았습니다. 잠시 후 다시 시도하세요.",
    loginToConfigure: "로그인하면 자신의 키를 설정할 수 있습니다",
  },
  ar: {
    storageNotice:
      "يُحفَظ مفتاحك مشفّرًا فقط في متصفح هذا الجهاز. خوادم OceanLeo لا تحتفظ به. كل استدعاء يمرّره عبر بوابة OceanLeo إلى المزوّد؛ تتخلص البوابة منه بعد الاستخدام ولا تسجّله. على جهاز آخر يجب إدخاله من جديد، ومسح بيانات الموقع يفقده.",
    storageBrowserOnly:
      "يُحفَظ مفتاحك مشفّرًا فقط في متصفح هذا الجهاز. خوادم OceanLeo لا تحتفظ به.",
    compatBadge: "واجهات متوافقة مع OpenAI فقط",
    endpointUrl: "عنوان الواجهة",
    pasteVendorKey: "الصق مفتاح API الخاص بالمزوّد",
    getFromConsole: "احصل عليه من وحدة تحكم المزوّد ←",
    bailianCodingPlan:
      "مفاتيح Bailian Coding Plan (التي تبدأ بـ sk-sp-) يُمنع استخدامها في خلفية التطبيق ولا يمكن استخدامها هنا.",
    modelName: "اسم النموذج",
    probe: "استكشاف",
    probeFailed: "تعذّر استكشاف النماذج.",
    modelPlaceholder: "مثل gpt-4o؛ اتركه فارغًا لاعتماد قيمة المزوّد",
    capability: "القدرات",
    capTools: "استدعاء الأدوات",
    capVision: "إدخال الصور",
    capReasoning: "وضع الاستدلال",
    toolsHint:
      "عند تحديد «استدعاء الأدوات» يمكن استخدام المفتاح في مهام الوكيل. إن لم يُحدَّد فسيُرجع الوكيل خطأً واضحًا.",
    configuredProviders: "المزوّدون المضبوطون",
    providerDefault: "قيمة المزوّد",
    gatewayNotEnabled: "البوابة لم تُفعّل BYOK بعد. حاول لاحقًا.",
    loginToConfigure: "سجّل الدخول لضبط مفتاحك",
  },
  hi: {
    storageNotice:
      "आपकी key केवल इसी डिवाइस के ब्राउज़र में एन्क्रिप्टेड रूप में रहती है। OceanLeo के सर्वर उसे नहीं रखते। हर कॉल उसे OceanLeo गेटवे से होकर विक्रेता तक भेजती है; गेटवे इस्तेमाल के बाद छोड़ देता है और रिकॉर्ड नहीं करता। दूसरे डिवाइस पर फिर भरना होगा, साइट डेटा मिटाने से वह खो जाएगी।",
    storageBrowserOnly:
      "आपकी key केवल इसी डिवाइस के ब्राउज़र में एन्क्रिप्टेड रूप में रहती है। OceanLeo के सर्वर उसे नहीं रखते।",
    compatBadge: "केवल OpenAI-संगत प्रोटोकॉल API",
    endpointUrl: "एंडपॉइंट पता",
    pasteVendorKey: "विक्रेता की API Key चिपकाएँ",
    getFromConsole: "विक्रेता कंसोल से लें →",
    bailianCodingPlan:
      "Bailian Coding Plan (sk-sp- से शुरू) की key ऐप बैकएंड में वर्जित है और यहाँ भी नहीं चल सकती।",
    modelName: "मॉडल नाम",
    probe: "खोजें",
    probeFailed: "मॉडल खोज नहीं सके।",
    modelPlaceholder: "जैसे gpt-4o; खाली छोड़ें तो विक्रेता डिफ़ॉल्ट",
    capability: "क्षमताएँ",
    capTools: "टूल कॉल",
    capVision: "छवि इनपुट",
    capReasoning: "रीज़निंग मोड",
    toolsHint:
      "「टूल कॉल」 चुनने पर key एजेंट कार्यों में चल सकती है। न चुनने पर एजेंट साफ़ त्रुटि देगा।",
    configuredProviders: "कॉन्फ़िगर किए गए विक्रेता",
    providerDefault: "विक्रेता डिफ़ॉल्ट",
    gatewayNotEnabled: "गेटवे ने अभी BYOK चालू नहीं किया। बाद में फिर कोशिश करें।",
    loginToConfigure: "लॉगिन करके अपनी key सेट करें",
  },
  th: {
    storageNotice:
      "คีย์ของคุณถูกเก็บแบบเข้ารหัสเฉพาะในเบราว์เซอร์ของอุปกรณ์นี้ OceanLeo ไม่เก็บไว้บนเซิร์ฟเวอร์ แต่ละครั้งที่เรียกใช้จะส่งผ่านเกตเวย์ OceanLeo ไปยังผู้ให้บริการ เกตเวย์ทิ้งทันทีหลังใช้และไม่บันทึก ต้องกรอกใหม่เมื่อเปลี่ยนเครื่อง และล้างข้อมูลไซต์แล้วจะหาย",
    storageBrowserOnly:
      "คีย์ของคุณถูกเก็บแบบเข้ารหัสเฉพาะในเบราว์เซอร์ของอุปกรณ์นี้ OceanLeo ไม่เก็บไว้บนเซิร์ฟเวอร์",
    compatBadge: "รองรับเฉพาะ API ที่เข้ากันกับ OpenAI",
    endpointUrl: "ที่อยู่เอนด์พอยต์",
    pasteVendorKey: "วาง API Key ของผู้ให้บริการ",
    getFromConsole: "ไปรับที่คอนโซลของผู้ให้บริการ →",
    bailianCodingPlan:
      "คีย์ Bailian Coding Plan (ขึ้นต้นด้วย sk-sp-) ห้ามใช้กับแบ็กเอนด์ของแอป และใช้ที่นี่ไม่ได้",
    modelName: "ชื่อโมเดล",
    probe: "สำรวจ",
    probeFailed: "สำรวจโมเดลไม่สำเร็จ",
    modelPlaceholder: "เช่น gpt-4o เว้นว่างเพื่อใช้ค่าเริ่มต้นของผู้ให้บริการ",
    capability: "ความสามารถ",
    capTools: "การเรียกเครื่องมือ",
    capVision: "อินพุตรูปภาพ",
    capReasoning: "โหมดให้เหตุผล",
    toolsHint:
      "เมื่อเลือก「การเรียกเครื่องมือ」จะใช้กับงานเอเจนต์ได้ หากไม่เลือก เอเจนต์จะแจ้งข้อผิดพลาดชัดเจน",
    configuredProviders: "ผู้ให้บริการที่ตั้งค่าแล้ว",
    providerDefault: "ค่าเริ่มต้นของผู้ให้บริการ",
    gatewayNotEnabled: "เกตเวย์ยังไม่ได้เปิด BYOK โปรดลองใหม่ภายหลัง",
    loginToConfigure: "เข้าสู่ระบบเพื่อตั้งค่าคีย์ของคุณ",
  },
  vi: {
    storageNotice:
      "Key của bạn chỉ được lưu dạng mã hóa trên trình duyệt của thiết bị này. Máy chủ OceanLeo không lưu. Mỗi lần gọi sẽ gửi qua cổng OceanLeo tới nhà cung cấp; cổng dùng xong là bỏ, không ghi lại. Đổi thiết bị phải điền lại; xóa dữ liệu trang sẽ mất key.",
    storageBrowserOnly:
      "Key của bạn chỉ được lưu dạng mã hóa trên trình duyệt của thiết bị này. Máy chủ OceanLeo không lưu.",
    compatBadge: "Chỉ hỗ trợ API giao thức tương thích OpenAI",
    endpointUrl: "Địa chỉ giao diện",
    pasteVendorKey: "Dán API Key của nhà cung cấp",
    getFromConsole: "Lấy từ bảng điều khiển nhà cung cấp →",
    bailianCodingPlan:
      "Key Bailian Coding Plan (bắt đầu bằng sk-sp-) không được dùng cho backend ứng dụng và không dùng được ở đây.",
    modelName: "Tên mô hình",
    probe: "Dò",
    probeFailed: "Không dò được mô hình.",
    modelPlaceholder: "ví dụ gpt-4o; để trống dùng mặc định của nhà cung cấp",
    capability: "Năng lực",
    capTools: "Gọi công cụ",
    capVision: "Nhập ảnh",
    capReasoning: "Chế độ suy luận",
    toolsHint:
      "Khi chọn「Gọi công cụ」có thể dùng cho tác vụ tác nhân. Nếu không chọn, tác nhân sẽ báo lỗi rõ.",
    configuredProviders: "Nhà cung cấp đã cấu hình",
    providerDefault: "Mặc định nhà cung cấp",
    gatewayNotEnabled: "Cổng chưa bật BYOK. Vui lòng thử lại sau.",
    loginToConfigure: "Đăng nhập để cấu hình key của bạn",
  },
} satisfies Record<
  "zh-TW" | "ja" | "ko" | "ar" | "hi" | "th" | "vi",
  ByokCopyMessages
>;
