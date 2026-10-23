import { LOCALES, type Locale } from "../../config";

const source = [
  "设计你的个人主页", "页面模板", "作品橱窗", "让图片和作品先说话", "专业工作室", "介绍服务，展示合作成果", "个人名片", "用经历与文字介绍自己", "简洁留白", "清晰的介绍与常用链接",
  "模板会保留已有内容与图片，只调整风格和顺序。", "个人资料", "页面设计", "版块顺序", "点击画布中的文字即可编辑；在左侧调整版块顺序。", "编辑内容", "预览主页", "有未保存的修改", "放弃未保存的修改？", "继续编辑", "放弃修改", "已公开", "未公开",
  "公开后，任何人都可以访问这张主页。", "保存后，仅你自己可以查看这张主页。", "作品集和资质核验单独保存。", "显示名不能为空。", "多项内容用逗号分隔。",
] as const;

const rows: Record<Locale, readonly string[]> = {
  zh: source,
  en: [
    "Design your personal page", "Page templates", "Portfolio", "Put your images and work first", "Professional studio", "Present your services and collaborations", "Personal profile", "Tell your story in your own words", "Minimal", "A clear introduction and your links",
    "Templates keep your content and images while changing the style and section order.", "Personal details", "Page design", "Section order", "Click text on the canvas to edit it. Arrange sections on the left.", "Edit content", "Preview page", "Unsaved changes", "Discard unsaved changes?", "Keep editing", "Discard changes", "Public", "Private",
    "Anyone can visit this page once it is public.", "After saving, only you can view this page.", "Portfolio items and qualifications are saved separately.", "Display name is required.", "Separate multiple items with commas.",
  ],
  de: [
    "Gestalte deine persönliche Seite", "Seitenvorlagen", "Portfolio", "Bilder und Arbeiten im Mittelpunkt", "Professionelles Studio", "Leistungen und Zusammenarbeit zeigen", "Persönliches Profil", "Erzähle deine Geschichte", "Minimalistisch", "Eine klare Vorstellung und deine Links",
    "Vorlagen behalten Inhalte und Bilder bei und ändern Stil und Reihenfolge.", "Persönliche Angaben", "Seitengestaltung", "Abschnittsreihenfolge", "Klicke auf Text, um ihn zu bearbeiten. Ordne Abschnitte links an.", "Inhalt bearbeiten", "Seitenvorschau", "Ungespeicherte Änderungen", "Ungespeicherte Änderungen verwerfen?", "Weiter bearbeiten", "Änderungen verwerfen", "Öffentlich", "Privat",
    "Jeder kann die öffentliche Seite besuchen.", "Nach dem Speichern kannst nur du diese Seite sehen.", "Portfolio und Qualifikationen werden separat gespeichert.", "Ein Anzeigename ist erforderlich.", "Trenne mehrere Einträge durch Kommas.",
  ],
  es: [
    "Diseña tu página personal", "Plantillas de página", "Portafolio", "Da protagonismo a tus imágenes y trabajos", "Estudio profesional", "Presenta tus servicios y colaboraciones", "Perfil personal", "Cuenta tu historia con tus palabras", "Minimalista", "Una presentación clara y tus enlaces",
    "Las plantillas conservan tu contenido e imágenes y cambian el estilo y el orden.", "Datos personales", "Diseño de página", "Orden de secciones", "Pulsa el texto para editarlo. Ordena las secciones a la izquierda.", "Editar contenido", "Vista previa", "Cambios sin guardar", "¿Descartar los cambios sin guardar?", "Seguir editando", "Descartar cambios", "Pública", "Privada",
    "Cualquiera puede visitar la página cuando sea pública.", "Tras guardar, solo tú podrás ver esta página.", "El portafolio y las acreditaciones se guardan por separado.", "El nombre visible es obligatorio.", "Separa los elementos con comas.",
  ],
  "es-419": [
    "Diseña tu página personal", "Plantillas de página", "Portafolio", "Destaca tus imágenes y trabajos", "Estudio profesional", "Presenta tus servicios y colaboraciones", "Perfil personal", "Cuenta tu historia con tus palabras", "Minimalista", "Una presentación clara y tus enlaces",
    "Las plantillas conservan tu contenido e imágenes y cambian el estilo y el orden.", "Datos personales", "Diseño de página", "Orden de secciones", "Haz clic en el texto para editarlo. Ordena las secciones a la izquierda.", "Editar contenido", "Vista previa", "Cambios sin guardar", "¿Descartar los cambios sin guardar?", "Seguir editando", "Descartar cambios", "Pública", "Privada",
    "Cualquiera puede visitar la página cuando sea pública.", "Después de guardar, solo tú podrás ver esta página.", "El portafolio y las acreditaciones se guardan por separado.", "El nombre visible es obligatorio.", "Separa los elementos con comas.",
  ],
  fr: [
    "Créez votre page personnelle", "Modèles de page", "Portfolio", "Mettez vos images et créations en avant", "Studio professionnel", "Présentez vos services et collaborations", "Profil personnel", "Racontez votre parcours", "Minimaliste", "Une présentation claire et vos liens",
    "Les modèles conservent vos contenus et images et modifient le style et l’ordre.", "Informations personnelles", "Style de la page", "Ordre des sections", "Cliquez sur le texte pour le modifier. Organisez les sections à gauche.", "Modifier le contenu", "Aperçu de la page", "Modifications non enregistrées", "Abandonner les modifications non enregistrées ?", "Continuer la modification", "Abandonner les modifications", "Publique", "Privée",
    "Tout le monde peut consulter une page publique.", "Après l’enregistrement, vous seul pourrez voir cette page.", "Le portfolio et les qualifications sont enregistrés séparément.", "Le nom affiché est obligatoire.", "Séparez les éléments par des virgules.",
  ],
  it: [
    "Crea la tua pagina personale", "Modelli di pagina", "Portfolio", "Metti in primo piano immagini e lavori", "Studio professionale", "Presenta servizi e collaborazioni", "Profilo personale", "Racconta la tua storia", "Minimalista", "Una presentazione chiara e i tuoi link",
    "I modelli mantengono contenuti e immagini e cambiano stile e ordine.", "Dati personali", "Design della pagina", "Ordine delle sezioni", "Fai clic sul testo per modificarlo. Ordina le sezioni a sinistra.", "Modifica contenuti", "Anteprima pagina", "Modifiche non salvate", "Scartare le modifiche non salvate?", "Continua a modificare", "Scarta modifiche", "Pubblica", "Privata",
    "Chiunque può visitare la pagina quando è pubblica.", "Dopo il salvataggio, solo tu potrai vedere questa pagina.", "Portfolio e qualifiche si salvano separatamente.", "Il nome visualizzato è obbligatorio.", "Separa gli elementi con virgole.",
  ],
  "pt-BR": [
    "Crie sua página pessoal", "Modelos de página", "Portfólio", "Destaque suas imagens e trabalhos", "Estúdio profissional", "Apresente serviços e colaborações", "Perfil pessoal", "Conte sua história", "Minimalista", "Uma apresentação clara e seus links",
    "Os modelos preservam conteúdo e imagens e alteram o estilo e a ordem.", "Dados pessoais", "Design da página", "Ordem das seções", "Clique no texto para editar. Organize as seções à esquerda.", "Editar conteúdo", "Visualizar página", "Alterações não salvas", "Descartar alterações não salvas?", "Continuar editando", "Descartar alterações", "Pública", "Privada",
    "Qualquer pessoa pode visitar a página quando ela é pública.", "Após salvar, só você poderá ver esta página.", "Portfólio e qualificações são salvos separadamente.", "O nome de exibição é obrigatório.", "Separe os itens com vírgulas.",
  ],
  "pt-PT": [
    "Crie a sua página pessoal", "Modelos de página", "Portefólio", "Destaque as suas imagens e trabalhos", "Estúdio profissional", "Apresente serviços e colaborações", "Perfil pessoal", "Conte a sua história", "Minimalista", "Uma apresentação clara e os seus links",
    "Os modelos preservam conteúdo e imagens e alteram o estilo e a ordem.", "Dados pessoais", "Design da página", "Ordem das secções", "Clique no texto para editar. Organize as secções à esquerda.", "Editar conteúdo", "Pré-visualizar página", "Alterações não guardadas", "Descartar alterações não guardadas?", "Continuar a editar", "Descartar alterações", "Pública", "Privada",
    "Qualquer pessoa pode visitar a página quando é pública.", "Depois de guardar, só poderá ver esta página.", "O portefólio e as qualificações são guardados separadamente.", "O nome de apresentação é obrigatório.", "Separe os itens por vírgulas.",
  ],
  vi: [
    "Thiết kế trang cá nhân", "Mẫu trang", "Hồ sơ tác phẩm", "Đưa hình ảnh và tác phẩm lên đầu", "Studio chuyên nghiệp", "Giới thiệu dịch vụ và dự án hợp tác", "Hồ sơ cá nhân", "Kể câu chuyện của bạn", "Tối giản", "Giới thiệu rõ ràng và các liên kết",
    "Mẫu giữ nguyên nội dung và hình ảnh, chỉ đổi phong cách và thứ tự.", "Thông tin cá nhân", "Thiết kế trang", "Thứ tự các phần", "Nhấp vào văn bản để sửa. Sắp xếp các phần ở bên trái.", "Sửa nội dung", "Xem trước trang", "Thay đổi chưa lưu", "Bỏ thay đổi chưa lưu?", "Tiếp tục sửa", "Bỏ thay đổi", "Công khai", "Riêng tư",
    "Mọi người đều có thể truy cập khi trang được công khai.", "Sau khi lưu, chỉ bạn mới có thể xem trang này.", "Tác phẩm và chứng chỉ được lưu riêng.", "Tên hiển thị là bắt buộc.", "Phân cách các mục bằng dấu phẩy.",
  ],
  tr: [
    "Kişisel sayfanı tasarla", "Sayfa şablonları", "Portföy", "Görsellerini ve çalışmalarını öne çıkar", "Profesyonel stüdyo", "Hizmetlerini ve iş birliklerini sun", "Kişisel profil", "Hikâyeni kendi sözlerinle anlat", "Sade", "Açık bir tanıtım ve bağlantıların",
    "Şablonlar içeriği ve görselleri korur; yalnızca stil ve sıralamayı değiştirir.", "Kişisel bilgiler", "Sayfa tasarımı", "Bölüm sırası", "Düzenlemek için metne tıkla. Bölümleri soldan sırala.", "İçeriği düzenle", "Sayfayı önizle", "Kaydedilmemiş değişiklikler", "Kaydedilmemiş değişiklikler silinsin mi?", "Düzenlemeye devam et", "Değişiklikleri sil", "Herkese açık", "Özel",
    "Sayfa herkese açık olduğunda herkes ziyaret edebilir.", "Kaydettikten sonra bu sayfayı yalnızca sen görebilirsin.", "Portföy ve yeterlilikler ayrı kaydedilir.", "Görünen ad gereklidir.", "Birden fazla öğeyi virgülle ayır.",
  ],
  "zh-TW": [
    "設計你的個人主頁", "頁面範本", "作品櫥窗", "讓圖片和作品先說話", "專業工作室", "介紹服務，展示合作成果", "個人名片", "用經歷與文字介紹自己", "簡潔留白", "清晰的介紹與常用連結",
    "範本會保留既有內容與圖片，只調整風格和順序。", "個人資料", "頁面設計", "區塊順序", "點擊畫布中的文字即可編輯；在左側調整區塊順序。", "編輯內容", "預覽主頁", "有未儲存的修改", "放棄未儲存的修改？", "繼續編輯", "放棄修改", "已公開", "未公開",
    "公開後，任何人都可以存取這張主頁。", "儲存後，只有你自己可以查看這張主頁。", "作品集和資格驗證分別儲存。", "顯示名稱不能為空。", "多項內容用逗號分隔。",
  ],
  ja: [
    "自分のページをデザイン", "ページテンプレート", "ポートフォリオ", "画像と作品を主役に", "プロのスタジオ", "サービスと実績を紹介", "自己紹介", "自分の言葉で経歴を伝える", "ミニマル", "明快な紹介とリンク",
    "内容と画像を残したまま、デザインと順序を変更します。", "プロフィール情報", "ページデザイン", "セクションの順序", "キャンバスの文字をクリックして編集。左側で順序を変更できます。", "内容を編集", "ページをプレビュー", "未保存の変更", "未保存の変更を破棄しますか？", "編集を続ける", "変更を破棄", "公開", "非公開",
    "公開すると誰でもページを閲覧できます。", "保存後、このページは自分だけが閲覧できます。", "作品集と資格情報は別々に保存されます。", "表示名を入力してください。", "複数の項目はカンマで区切ってください。",
  ],
  ko: [
    "개인 페이지 디자인", "페이지 템플릿", "포트폴리오", "이미지와 작품을 먼저 보여주세요", "전문 스튜디오", "서비스와 협업 성과 소개", "개인 프로필", "자신의 말로 경험을 소개하세요", "미니멀", "명확한 소개와 링크",
    "기존 내용과 이미지를 유지하고 스타일과 순서만 바꿉니다.", "개인 정보", "페이지 디자인", "섹션 순서", "캔버스의 글자를 클릭해 편집하세요. 왼쪽에서 순서를 바꿀 수 있습니다.", "내용 편집", "페이지 미리보기", "저장하지 않은 변경 사항", "저장하지 않은 변경을 버릴까요?", "계속 편집", "변경 버리기", "공개", "비공개",
    "공개하면 누구나 이 페이지를 볼 수 있습니다.", "저장 후에는 본인만 이 페이지를 볼 수 있습니다.", "포트폴리오와 자격 정보는 별도로 저장됩니다.", "표시 이름을 입력해 주세요.", "여러 항목은 쉼표로 구분하세요.",
  ],
  ar: [
    "صمّم صفحتك الشخصية", "قوالب الصفحة", "معرض الأعمال", "أبرز صورك وأعمالك أولاً", "استوديو احترافي", "قدّم خدماتك ونتائج التعاون", "ملف شخصي", "احكِ قصتك بكلماتك", "بسيط", "تعريف واضح وروابطك",
    "تحتفظ القوالب بالمحتوى والصور وتغيّر النمط وترتيب الأقسام فقط.", "المعلومات الشخصية", "تصميم الصفحة", "ترتيب الأقسام", "انقر النص لتحريره. رتّب الأقسام من اللوحة الجانبية.", "تحرير المحتوى", "معاينة الصفحة", "تغييرات غير محفوظة", "تجاهل التغييرات غير المحفوظة؟", "متابعة التحرير", "تجاهل التغييرات", "عامة", "خاصة",
    "يمكن للجميع زيارة الصفحة بعد جعلها عامة.", "بعد الحفظ، ستتمكن وحدك من عرض هذه الصفحة.", "تُحفظ الأعمال والمؤهلات بشكل منفصل.", "اسم العرض مطلوب.", "افصل العناصر المتعددة بفواصل.",
  ],
  th: [
    "ออกแบบหน้าส่วนตัวของคุณ", "เทมเพลตหน้า", "แฟ้มผลงาน", "ให้ภาพและผลงานโดดเด่นก่อน", "สตูดิโอมืออาชีพ", "แนะนำบริการและผลงานร่วมมือ", "โปรไฟล์ส่วนตัว", "บอกเล่าประสบการณ์ด้วยคำของคุณ", "เรียบง่าย", "คำแนะนำตัวที่ชัดเจนและลิงก์",
    "เทมเพลตเก็บเนื้อหาและภาพเดิมไว้ แล้วเปลี่ยนสไตล์และลำดับส่วนเท่านั้น", "ข้อมูลส่วนตัว", "การออกแบบหน้า", "ลำดับส่วน", "คลิกข้อความเพื่อแก้ไข จัดลำดับส่วนทางซ้าย", "แก้ไขเนื้อหา", "ดูตัวอย่างหน้า", "มีการเปลี่ยนแปลงที่ยังไม่บันทึก", "ทิ้งการเปลี่ยนแปลงที่ยังไม่บันทึกหรือไม่", "แก้ไขต่อ", "ทิ้งการเปลี่ยนแปลง", "สาธารณะ", "ส่วนตัว",
    "ทุกคนเข้าชมหน้านี้ได้เมื่อเผยแพร่สู่สาธารณะ", "หลังบันทึก จะมีเพียงคุณที่ดูหน้านี้ได้", "ผลงานและคุณสมบัติจะบันทึกแยกกัน", "ต้องระบุชื่อที่แสดง", "คั่นหลายรายการด้วยจุลภาค",
  ],
  hi: [
    "अपना व्यक्तिगत पेज डिज़ाइन करें", "पेज टेम्पलेट", "पोर्टफ़ोलियो", "चित्रों और काम को पहले दिखाएँ", "पेशेवर स्टूडियो", "सेवाएँ और सहयोग के परिणाम दिखाएँ", "व्यक्तिगत प्रोफ़ाइल", "अपनी कहानी अपने शब्दों में बताएँ", "सादा", "स्पष्ट परिचय और आपके लिंक",
    "टेम्पलेट सामग्री और चित्र बनाए रखते हैं और केवल शैली व क्रम बदलते हैं।", "व्यक्तिगत जानकारी", "पेज डिज़ाइन", "अनुभागों का क्रम", "संपादित करने के लिए पाठ पर क्लिक करें। बाईं ओर अनुभागों का क्रम बदलें।", "सामग्री संपादित करें", "पेज का पूर्वावलोकन", "बिना सहेजे बदलाव", "बिना सहेजे बदलाव छोड़ें?", "संपादन जारी रखें", "बदलाव छोड़ें", "सार्वजनिक", "निजी",
    "सार्वजनिक होने पर कोई भी यह पेज देख सकता है।", "सहेजने के बाद केवल आप यह पेज देख पाएँगे।", "पोर्टफ़ोलियो और योग्यताएँ अलग से सहेजी जाती हैं।", "प्रदर्शित नाम आवश्यक है।", "कई मदों को अल्पविराम से अलग करें।",
  ],
};

export const UI_FOLLOWUP_PROFILE_MESSAGES = Object.fromEntries(
  LOCALES.map((locale) => [locale, Object.fromEntries(source.map((key, index) => [key, rows[locale][index]]))]),
) as Record<Locale, Record<string, string>>;
