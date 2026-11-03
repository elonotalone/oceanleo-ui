// 2026-11-03 W6: device permissions, history, Library and website workbench gaps.
// Chinese source keys are shared with tt(); each locale has its own translation.
// The base zh/en dictionaries already own 在 Library 中查看; do not override them.
import { LOCALES, type Locale } from "../../config";

const SOURCE = [
  "4 小时",
  "Agent 每次控制都要同意",
  "仅你的账号可以开启；到时间会自动关闭，也可以在这台电脑的托盘中停止。",
  "允许 Agent 控制此设备",
  "允许云端助手使用这台电脑",
  "允许操作屏幕（查看、点击、输入）",
  "允许时长",
  "关闭后，Agent 申请仍会显示，但不会自动获得远程控制。",
  "开启后，Agent 每次申请都会在这台电脑上等待确认。",
  "自己的账号访问这台设备会直接连接。远程访问和云端助手的权限在这里设置。",
  "访问与控制",
  "关闭搜索",
  "没有匹配的任务。",
  "协作连接已断开，正在重试",
  "所有素材",
  "在 Library 中查看",
  "共 {total} 条",
  "无数据",
  "看板数据暂不可用。",
  "让 agent 配置此看板",
  "该看板尚未接线。",
  "取消点选",
  "引用插入失败，引用已保留，请重试插入。",
  "截图失败，可继续发送位置引用。",
  "无法打开此网站的 agent 对话，请重试。",
  "正在打开 agent 对话并等待输入框…",
  "添加截图",
  "点击预览位置，将坐标和截图引用放入对话输入框。",
  "点选元素",
  "等待 agent 对话输入框超时，引用已保留，请重试插入。",
  "请使用当前标签页截图，以便坐标对应预览。",
  "跨域预览仅记录点击坐标，不读取页面 DOM。",
  "重试插入",
  "任务已创建",
  "启动",
  "唤醒",
  "打开 agent 任务",
  "暂无日志",
  "暂无看板",
  "查看运行日志",
  "电脑",
  "看板",
  "网站预览",
  "让 agent 修复",
  "让 agent 写入运行说明",
  "请写入 .oceanleo/run.json 运行说明。",
  "请求失败，请重试。",
  "路径须以 / 开头，且只能在当前网站内跳转。",
  "运行日志",
  "返回预览",
  "重启",
  "预览地址尚不可用。",
  "预览路径",
  "SQL 控制台",
  "主域名",
  "仓库",
  "以下读数来自网站项目 API；没有返回的计量保持不可用。",
  "分析状态",
  "发布到 .ws.oceanleo.app",
  "域名",
  "域名已添加",
  "存储文件列表",
  "存储桶",
  "存储用量",
  "已创建回滚部署",
  "已创建恢复提交 {commit}",
  "已提交发布",
  "当前提交",
  "恢复为新提交",
  "恢复网站版本 {commit}",
  "成本记录",
  "成本记录暂不可用。",
  "技术栈",
  "未定价",
  "未绑定",
  "正在读取网站数据…",
  "此存储桶还没有文件。",
  "此网站还没有成本记录。",
  "环境",
  "环境变量引用",
  "用量与成本",
  "网站工作台",
  "访问量",
  "运行 SQL",
  "例如：一个展示作品集和联系方式的简洁网站",
  "创建网站",
  "描述你想做的网站",
  "新建网站"
] as const;

// One line per SOURCE key. A focused test checks length, placeholders and coverage.
const lines = (text: string): string[] => text.trim().split("\n");

const TRANSLATIONS: Record<Exclude<Locale, "zh" | "es-419">, readonly string[]> = {
  "pt-PT": lines(`
4 horas
Pedir aprovação sempre que Agent assumir o controlo
Apenas a sua conta pode ativar esta opção. É desativada no fim do prazo; também a pode parar na área de notificação deste computador.
Permitir que Agent controle este dispositivo
Permitir que o assistente na nuvem utilize este computador
Permitir o controlo do ecrã (ver, clicar, escrever)
Duração da permissão
Quando desativado, os pedidos de Agent continuam a aparecer, mas o controlo remoto não é concedido automaticamente.
Quando ativado, cada pedido de Agent aguarda confirmação neste computador.
A sua própria conta liga-se diretamente a este dispositivo. Defina aqui as permissões de acesso remoto e do assistente na nuvem.
Acesso e controlo
Fechar pesquisa
Nenhuma tarefa correspondente.
Ligação de colaboração interrompida. A tentar novamente
Todos os recursos
Ver na Library
{total} registos no total
Sem dados
Os dados do painel estão temporariamente indisponíveis.
Pedir a Agent para configurar este painel
Este painel ainda não está ligado.
Cancelar seleção
Não foi possível inserir a referência. Foi guardada; tente inseri-la novamente.
Não foi possível capturar o ecrã. Ainda pode enviar a referência de posição.
Não foi possível abrir a conversa de Agent deste site. Tente novamente.
A abrir a conversa de Agent e a aguardar o campo de introdução…
Adicionar captura de ecrã
Clique num ponto da pré-visualização para adicionar as coordenadas e a referência da captura ao campo da conversa.
Selecionar elemento
O tempo de espera pelo campo da conversa de Agent expirou. A referência foi guardada; tente inseri-la novamente.
Capture o separador atual para que as coordenadas correspondam à pré-visualização.
As pré-visualizações de outra origem registam apenas as coordenadas dos cliques; não leem o DOM da página.
Tentar inserir novamente
Tarefa criada
Iniciar
Reativar
Abrir tarefa de Agent
Ainda não há registos
Ainda não há painéis
Ver registos de execução
Computador
Painel
Pré-visualização do site
Pedir a Agent para corrigir
Pedir a Agent para escrever as instruções de execução
Escreva as instruções de execução em .oceanleo/run.json.
O pedido falhou. Tente novamente.
O caminho deve começar por / e só pode navegar dentro deste site.
Registos de execução
Voltar à pré-visualização
Reiniciar
O URL da pré-visualização ainda não está disponível.
Caminho da pré-visualização
Consola SQL
Domínio principal
Repositório
Estas leituras provêm da API do projeto do site. As métricas não devolvidas continuam indisponíveis.
Estado da análise
Publicar em .ws.oceanleo.app
Domínio
Domínio adicionado
Lista de ficheiros armazenados
Contentor de armazenamento
Utilização do armazenamento
Implementação de reversão criada
Commit de restauro {commit} criado
Publicação submetida
Commit atual
Restaurar como novo commit
Restaurar a versão {commit} do site
Registos de custos
Os registos de custos estão temporariamente indisponíveis.
Tecnologias utilizadas
Preço por definir
Não associado
A carregar dados do site…
Este contentor ainda não tem ficheiros.
Este site ainda não tem registos de custos.
Ambiente
Referências a variáveis de ambiente
Utilização e custos
Área de trabalho do site
Visitas
Executar SQL
Por exemplo: um site simples com portefólio e informações de contacto
Criar site
Descreva o site que pretende criar
Novo site
`),
  ar: lines(`
4 ساعات
طلب الموافقة كلما تولّى Agent التحكم
حسابك وحده يمكنه تفعيل هذا الخيار. يتوقف تلقائياً عند انتهاء المدة، ويمكنك إيقافه أيضاً من علبة النظام على هذا الكمبيوتر.
السماح لـ Agent بالتحكم في هذا الجهاز
السماح للمساعد السحابي باستخدام هذا الكمبيوتر
السماح بالتحكم في الشاشة (العرض والنقر والكتابة)
مدة الإذن
عند إيقاف الخيار، تظل طلبات Agent ظاهرة، لكن لا يُمنح التحكم عن بُعد تلقائياً.
عند تفعيل الخيار، ينتظر كل طلب من Agent التأكيد على هذا الكمبيوتر.
يتصل حسابك مباشرة بهذا الجهاز. اضبط هنا أذونات الوصول عن بُعد والمساعد السحابي.
الوصول والتحكم
إغلاق البحث
لا توجد مهام مطابقة.
انقطع اتصال التعاون. جارٍ إعادة المحاولة
كل الموارد
عرض في Library
إجمالي السجلات: {total}
لا توجد بيانات
بيانات لوحة المعلومات غير متاحة مؤقتاً.
اطلب من Agent إعداد لوحة المعلومات هذه
لم يتم توصيل لوحة المعلومات هذه بعد.
إلغاء التحديد
تعذّر إدراج المرجع. تم الاحتفاظ به؛ حاول إدراجه مرة أخرى.
تعذّر التقاط لقطة شاشة. لا يزال بإمكانك إرسال مرجع الموقع.
تعذّر فتح محادثة Agent لهذا الموقع. يرجى المحاولة مرة أخرى.
جارٍ فتح محادثة Agent وانتظار حقل الإدخال…
إضافة لقطة شاشة
انقر على موضع في المعاينة لإضافة إحداثياته ومرجع لقطة الشاشة إلى حقل المحادثة.
تحديد عنصر
انتهت مهلة انتظار حقل محادثة Agent. تم الاحتفاظ بالمرجع؛ حاول إدراجه مرة أخرى.
التقط علامة التبويب الحالية كي تتطابق الإحداثيات مع المعاينة.
تسجّل المعاينات من أصل مختلف إحداثيات النقر فقط ولا تقرأ DOM الصفحة.
إعادة محاولة الإدراج
تم إنشاء المهمة
بدء التشغيل
إيقاظ
فتح مهمة Agent
لا توجد سجلات بعد
لا توجد لوحات معلومات بعد
عرض سجلات التشغيل
كمبيوتر
لوحة المعلومات
معاينة الموقع
اطلب من Agent الإصلاح
اطلب من Agent كتابة تعليمات التشغيل
يرجى كتابة تعليمات التشغيل في .oceanleo/run.json.
فشل الطلب. يرجى المحاولة مرة أخرى.
يجب أن يبدأ المسار بـ / وألا ينتقل إلا داخل هذا الموقع.
سجلات التشغيل
العودة إلى المعاينة
إعادة التشغيل
عنوان المعاينة غير متاح بعد.
مسار المعاينة
وحدة تحكم SQL
النطاق الرئيسي
مستودع الشفرة
تأتي هذه القراءات من واجهة API لمشروع الموقع. تظل المقاييس التي لا تُرجعها الواجهة غير متاحة.
حالة التحليلات
النشر على .ws.oceanleo.app
النطاق
تمت إضافة النطاق
قائمة الملفات المخزّنة
حاوية التخزين
استخدام التخزين
تم إنشاء نشر للرجوع إلى الإصدار السابق
تم إنشاء إيداع استعادة {commit}
تم إرسال طلب النشر
الإيداع الحالي
الاستعادة كإيداع جديد
استعادة إصدار الموقع {commit}
سجلات التكلفة
سجلات التكلفة غير متاحة مؤقتاً.
التقنيات المستخدمة
السعر غير محدد
غير مرتبط
جارٍ تحميل بيانات الموقع…
لا توجد ملفات في هذه الحاوية بعد.
لا توجد سجلات تكلفة لهذا الموقع بعد.
البيئة
مراجع متغيرات البيئة
الاستخدام والتكلفة
مساحة عمل الموقع
الزيارات
تشغيل SQL
مثلاً: موقع بسيط يعرض ملف الأعمال وبيانات الاتصال
إنشاء موقع
صِف الموقع الذي تريد إنشاءه
موقع جديد
`),
  th: lines(`
4 ชั่วโมง
ขออนุมัติทุกครั้งที่ Agent เข้าควบคุม
เฉพาะบัญชีของคุณเท่านั้นที่เปิดได้ ระบบจะปิดอัตโนมัติเมื่อหมดเวลา หรือคุณสามารถหยุดจากถาดระบบของคอมพิวเตอร์เครื่องนี้ได้
อนุญาตให้ Agent ควบคุมอุปกรณ์นี้
อนุญาตให้ผู้ช่วยบนคลาวด์ใช้คอมพิวเตอร์เครื่องนี้
อนุญาตให้ควบคุมหน้าจอ (ดู คลิก พิมพ์)
ระยะเวลาที่อนุญาต
เมื่อปิด คำขอของ Agent จะยังแสดงอยู่ แต่จะไม่ได้รับสิทธิ์ควบคุมระยะไกลโดยอัตโนมัติ
เมื่อเปิด คำขอของ Agent แต่ละครั้งจะรอการยืนยันบนคอมพิวเตอร์เครื่องนี้
บัญชีของคุณเองจะเชื่อมต่อกับอุปกรณ์นี้โดยตรง ตั้งค่าสิทธิ์การเข้าถึงระยะไกลและผู้ช่วยบนคลาวด์ได้ที่นี่
การเข้าถึงและการควบคุม
ปิดการค้นหา
ไม่พบงานที่ตรงกัน
การเชื่อมต่อการทำงานร่วมกันขาดหาย กำลังลองใหม่
ทรัพยากรทั้งหมด
ดูใน Library
ทั้งหมด {total} รายการ
ไม่มีข้อมูล
ข้อมูลแดชบอร์ดไม่พร้อมใช้งานชั่วคราว
ให้ Agent ตั้งค่าแดชบอร์ดนี้
แดชบอร์ดนี้ยังไม่ได้เชื่อมต่อ
ยกเลิกการเลือก
แทรกข้อมูลอ้างอิงไม่สำเร็จ ระบบเก็บข้อมูลอ้างอิงไว้แล้ว โปรดลองแทรกอีกครั้ง
จับภาพหน้าจอไม่สำเร็จ คุณยังส่งข้อมูลอ้างอิงตำแหน่งได้
เปิดแชต Agent ของเว็บไซต์นี้ไม่สำเร็จ โปรดลองอีกครั้ง
กำลังเปิดแชต Agent และรอช่องป้อนข้อความ…
เพิ่มภาพหน้าจอ
คลิกตำแหน่งในตัวอย่างเพื่อเพิ่มพิกัดและข้อมูลอ้างอิงภาพหน้าจอลงในช่องป้อนข้อความแชต
เลือกองค์ประกอบ
หมดเวลารอช่องป้อนข้อความแชต Agent ระบบเก็บข้อมูลอ้างอิงไว้แล้ว โปรดลองแทรกอีกครั้ง
โปรดจับภาพแท็บปัจจุบันเพื่อให้พิกัดตรงกับตัวอย่าง
ตัวอย่างจากต่างต้นทางจะบันทึกเฉพาะพิกัดคลิก โดยไม่อ่าน DOM ของหน้า
ลองแทรกอีกครั้ง
สร้างงานแล้ว
เริ่มทำงาน
ปลุก
เปิดงาน Agent
ยังไม่มีบันทึก
ยังไม่มีแดชบอร์ด
ดูบันทึกการทำงาน
คอมพิวเตอร์
แดชบอร์ด
ตัวอย่างเว็บไซต์
ให้ Agent แก้ไข
ให้ Agent เขียนคำแนะนำการทำงาน
โปรดเขียนคำแนะนำการทำงานลงใน .oceanleo/run.json
คำขอล้มเหลว โปรดลองอีกครั้ง
พาธต้องขึ้นต้นด้วย / และนำทางได้เฉพาะภายในเว็บไซต์นี้
บันทึกการทำงาน
กลับไปที่ตัวอย่าง
เริ่มใหม่
URL ตัวอย่างยังไม่พร้อมใช้งาน
พาธตัวอย่าง
คอนโซล SQL
โดเมนหลัก
คลังโค้ด
ค่าที่แสดงมาจาก API ของโครงการเว็บไซต์ ตัวชี้วัดที่ไม่ได้ส่งกลับมาจะยังคงแสดงว่าไม่พร้อมใช้งาน
สถานะการวิเคราะห์
เผยแพร่ไปยัง .ws.oceanleo.app
โดเมน
เพิ่มโดเมนแล้ว
รายการไฟล์ที่จัดเก็บ
บัคเก็ตที่เก็บข้อมูล
การใช้พื้นที่จัดเก็บ
สร้างการปรับใช้เพื่อย้อนกลับแล้ว
สร้างคอมมิตกู้คืน {commit} แล้ว
ส่งคำขอเผยแพร่แล้ว
คอมมิตปัจจุบัน
กู้คืนเป็นคอมมิตใหม่
กู้คืนเว็บไซต์เวอร์ชัน {commit}
บันทึกค่าใช้จ่าย
บันทึกค่าใช้จ่ายไม่พร้อมใช้งานชั่วคราว
ชุดเทคโนโลยี
ยังไม่กำหนดราคา
ยังไม่เชื่อมโยง
กำลังโหลดข้อมูลเว็บไซต์…
บัคเก็ตนี้ยังไม่มีไฟล์
เว็บไซต์นี้ยังไม่มีบันทึกค่าใช้จ่าย
สภาพแวดล้อม
ข้อมูลอ้างอิงตัวแปรสภาพแวดล้อม
การใช้งานและค่าใช้จ่าย
พื้นที่ทำงานเว็บไซต์
จำนวนการเข้าชม
เรียกใช้ SQL
ตัวอย่าง: เว็บไซต์เรียบง่ายที่แสดงผลงานและข้อมูลติดต่อ
สร้างเว็บไซต์
อธิบายเว็บไซต์ที่คุณต้องการสร้าง
เว็บไซต์ใหม่
`),
  hi: lines(`
4 घंटे
Agent के हर नियंत्रण अनुरोध पर अनुमति माँगें
केवल आपका खाता इसे चालू कर सकता है। समय पूरा होने पर यह अपने आप बंद हो जाता है; आप इसे इस कंप्यूटर की सिस्टम ट्रे से भी रोक सकते हैं।
Agent को इस डिवाइस का नियंत्रण करने दें
क्लाउड सहायक को इस कंप्यूटर का उपयोग करने दें
स्क्रीन नियंत्रण की अनुमति दें (देखना, क्लिक करना, लिखना)
अनुमति की अवधि
बंद होने पर Agent के अनुरोध दिखते रहेंगे, लेकिन रिमोट नियंत्रण की अनुमति अपने आप नहीं मिलेगी।
चालू होने पर Agent का हर अनुरोध इस कंप्यूटर पर पुष्टि का इंतज़ार करेगा।
आपका अपना खाता इस डिवाइस से सीधे जुड़ता है। रिमोट ऐक्सेस और क्लाउड सहायक की अनुमतियाँ यहाँ सेट करें।
ऐक्सेस और नियंत्रण
खोज बंद करें
कोई मेल खाता कार्य नहीं है।
सहयोग कनेक्शन टूट गया। फिर कोशिश हो रही है
सभी संसाधन
Library में देखें
कुल {total} रिकॉर्ड
कोई डेटा नहीं
डैशबोर्ड डेटा कुछ समय के लिए उपलब्ध नहीं है।
Agent से यह डैशबोर्ड कॉन्फ़िगर करने को कहें
यह डैशबोर्ड अभी जुड़ा नहीं है।
चयन रद्द करें
संदर्भ नहीं जोड़ा जा सका। इसे सुरक्षित रखा गया है; फिर से जोड़ें।
स्क्रीनशॉट नहीं लिया जा सका। आप फिर भी स्थान का संदर्भ भेज सकते हैं।
इस वेबसाइट की Agent चैट नहीं खुल सकी। फिर कोशिश करें।
Agent चैट खोली जा रही है और इनपुट फ़ील्ड का इंतज़ार है…
स्क्रीनशॉट जोड़ें
प्रीव्यू में किसी स्थान पर क्लिक करें ताकि उसके निर्देशांक और स्क्रीनशॉट का संदर्भ चैट इनपुट में जुड़ जाए।
एलिमेंट चुनें
Agent चैट इनपुट का इंतज़ार करते हुए समय समाप्त हो गया। संदर्भ सुरक्षित है; फिर से जोड़ें।
मौजूदा टैब का स्क्रीनशॉट लें ताकि निर्देशांक प्रीव्यू से मेल खाएँ।
अलग ओरिजिन के प्रीव्यू केवल क्लिक के निर्देशांक दर्ज करते हैं; पेज का DOM नहीं पढ़ते।
फिर से जोड़ें
कार्य बनाया गया
शुरू करें
जगाएँ
Agent कार्य खोलें
अभी कोई लॉग नहीं है
अभी कोई डैशबोर्ड नहीं है
रनटाइम लॉग देखें
कंप्यूटर
डैशबोर्ड
वेबसाइट प्रीव्यू
Agent से ठीक करने को कहें
Agent से चलाने के निर्देश लिखने को कहें
कृपया .oceanleo/run.json में चलाने के निर्देश लिखें।
अनुरोध विफल हुआ। फिर कोशिश करें।
पाथ / से शुरू होना चाहिए और केवल इसी वेबसाइट के भीतर ले जाना चाहिए।
रनटाइम लॉग
प्रीव्यू पर वापस जाएँ
फिर शुरू करें
प्रीव्यू URL अभी उपलब्ध नहीं है।
प्रीव्यू पाथ
SQL कंसोल
मुख्य डोमेन
कोड रिपॉज़िटरी
ये आँकड़े वेबसाइट प्रोजेक्ट API से आते हैं। जो मेट्रिक वापस नहीं मिलते, वे अनुपलब्ध ही रहते हैं।
एनालिटिक्स की स्थिति
.ws.oceanleo.app पर प्रकाशित करें
डोमेन
डोमेन जोड़ा गया
संग्रहीत फ़ाइलों की सूची
स्टोरेज बकेट
स्टोरेज का उपयोग
रोलबैक डिप्लॉयमेंट बनाया गया
रिस्टोर कमिट {commit} बनाया गया
प्रकाशन का अनुरोध भेजा गया
मौजूदा कमिट
नए कमिट के रूप में रिस्टोर करें
वेबसाइट का संस्करण {commit} रिस्टोर करें
लागत रिकॉर्ड
लागत रिकॉर्ड कुछ समय के लिए उपलब्ध नहीं हैं।
टेक्नोलॉजी स्टैक
कीमत तय नहीं है
लिंक नहीं है
वेबसाइट डेटा लोड हो रहा है…
इस बकेट में अभी कोई फ़ाइल नहीं है।
इस वेबसाइट के अभी कोई लागत रिकॉर्ड नहीं हैं।
एनवायरनमेंट
एनवायरनमेंट वेरिएबल के संदर्भ
उपयोग और लागत
वेबसाइट कार्यक्षेत्र
विज़िट
SQL चलाएँ
उदाहरण: पोर्टफ़ोलियो और संपर्क विवरण वाली एक सरल वेबसाइट
वेबसाइट बनाएँ
बताएँ कि आप कैसी वेबसाइट बनाना चाहते हैं
नई वेबसाइट
`),
  vi: lines(`
4 giờ
Yêu cầu phê duyệt mỗi lần Agent điều khiển
Chỉ tài khoản của bạn có thể bật tùy chọn này. Tùy chọn tự tắt khi hết thời gian; bạn cũng có thể dừng từ khay hệ thống của máy tính này.
Cho phép Agent điều khiển thiết bị này
Cho phép trợ lý đám mây sử dụng máy tính này
Cho phép điều khiển màn hình (xem, nhấp, nhập)
Thời hạn cho phép
Khi tắt, yêu cầu của Agent vẫn hiển thị nhưng quyền điều khiển từ xa không được tự động cấp.
Khi bật, mỗi yêu cầu của Agent sẽ chờ xác nhận trên máy tính này.
Tài khoản của bạn kết nối trực tiếp với thiết bị này. Thiết lập quyền truy cập từ xa và trợ lý đám mây tại đây.
Truy cập và điều khiển
Đóng tìm kiếm
Không có tác vụ phù hợp.
Kết nối cộng tác bị ngắt. Đang thử lại
Tất cả tài nguyên
Xem trong Library
Tổng cộng {total} bản ghi
Không có dữ liệu
Dữ liệu bảng điều khiển tạm thời không khả dụng.
Yêu cầu Agent cấu hình bảng điều khiển này
Bảng điều khiển này chưa được kết nối.
Hủy chọn
Không thể chèn tham chiếu. Tham chiếu đã được giữ lại; hãy thử chèn lại.
Không thể chụp màn hình. Bạn vẫn có thể gửi tham chiếu vị trí.
Không thể mở cuộc trò chuyện Agent của trang web này. Vui lòng thử lại.
Đang mở cuộc trò chuyện Agent và chờ ô nhập…
Thêm ảnh chụp màn hình
Nhấp vào một vị trí trong bản xem trước để thêm tọa độ và tham chiếu ảnh chụp vào ô nhập trò chuyện.
Chọn phần tử
Đã hết thời gian chờ ô nhập trò chuyện Agent. Tham chiếu đã được giữ lại; hãy thử chèn lại.
Hãy chụp thẻ hiện tại để tọa độ khớp với bản xem trước.
Bản xem trước khác nguồn chỉ ghi lại tọa độ nhấp, không đọc DOM của trang.
Thử chèn lại
Đã tạo tác vụ
Khởi động
Đánh thức
Mở tác vụ Agent
Chưa có nhật ký
Chưa có bảng điều khiển
Xem nhật ký chạy
Máy tính
Bảng điều khiển
Xem trước trang web
Yêu cầu Agent sửa lỗi
Yêu cầu Agent viết hướng dẫn chạy
Vui lòng viết hướng dẫn chạy vào .oceanleo/run.json.
Yêu cầu thất bại. Vui lòng thử lại.
Đường dẫn phải bắt đầu bằng / và chỉ được điều hướng trong trang web này.
Nhật ký chạy
Quay lại bản xem trước
Khởi động lại
URL xem trước chưa khả dụng.
Đường dẫn xem trước
Bảng điều khiển SQL
Tên miền chính
Kho mã
Các số liệu này đến từ API dự án trang web. Chỉ số không được trả về sẽ tiếp tục ở trạng thái không khả dụng.
Trạng thái phân tích
Xuất bản lên .ws.oceanleo.app
Tên miền
Đã thêm tên miền
Danh sách tệp lưu trữ
Vùng chứa lưu trữ
Dung lượng lưu trữ đã dùng
Đã tạo bản triển khai hoàn tác
Đã tạo commit khôi phục {commit}
Đã gửi yêu cầu xuất bản
Commit hiện tại
Khôi phục thành commit mới
Khôi phục phiên bản trang web {commit}
Bản ghi chi phí
Bản ghi chi phí tạm thời không khả dụng.
Bộ công nghệ
Chưa định giá
Chưa liên kết
Đang tải dữ liệu trang web…
Vùng chứa này chưa có tệp.
Trang web này chưa có bản ghi chi phí.
Môi trường
Tham chiếu biến môi trường
Mức sử dụng và chi phí
Không gian làm việc trang web
Lượt truy cập
Chạy SQL
Ví dụ: một trang web đơn giản giới thiệu hồ sơ tác phẩm và thông tin liên hệ
Tạo trang web
Mô tả trang web bạn muốn tạo
Trang web mới
`),
  tr: lines(`
4 saat
Agent her kontrol aldığında onay iste
Yalnızca sizin hesabınız etkinleştirebilir. Süre dolunca otomatik kapanır; bu bilgisayarın sistem tepsisinden de durdurabilirsiniz.
Agent'ın bu cihazı kontrol etmesine izin ver
Bulut asistanının bu bilgisayarı kullanmasına izin ver
Ekran kontrolüne izin ver (görüntüleme, tıklama, yazma)
İzin süresi
Kapalıyken Agent istekleri görünmeye devam eder, ancak uzaktan kontrol izni otomatik verilmez.
Açıkken her Agent isteği bu bilgisayarda onay bekler.
Kendi hesabınız bu cihaza doğrudan bağlanır. Uzaktan erişim ve bulut asistanı izinlerini burada ayarlayın.
Erişim ve kontrol
Aramayı kapat
Eşleşen görev yok.
İş birliği bağlantısı kesildi. Yeniden deneniyor
Tüm varlıklar
Library içinde görüntüle
Toplam {total} kayıt
Veri yok
Pano verileri geçici olarak kullanılamıyor.
Agent'tan bu panoyu yapılandırmasını iste
Bu pano henüz bağlanmadı.
Seçimi iptal et
Referans eklenemedi. Saklandı; yeniden eklemeyi deneyin.
Ekran görüntüsü alınamadı. Konum referansını yine de gönderebilirsiniz.
Bu sitenin Agent sohbeti açılamadı. Lütfen yeniden deneyin.
Agent sohbeti açılıyor ve giriş alanı bekleniyor…
Ekran görüntüsü ekle
Koordinatları ve ekran görüntüsü referansını sohbet girişine eklemek için önizlemede bir konuma tıklayın.
Öğe seç
Agent sohbet giriş alanı beklenirken zaman aşımına uğradı. Referans saklandı; yeniden eklemeyi deneyin.
Koordinatların önizlemeyle eşleşmesi için geçerli sekmenin ekran görüntüsünü alın.
Farklı kaynaklı önizlemeler yalnızca tıklama koordinatlarını kaydeder; sayfanın DOM'unu okumaz.
Yeniden ekle
Görev oluşturuldu
Başlat
Uyandır
Agent görevini aç
Henüz günlük yok
Henüz pano yok
Çalışma günlüklerini görüntüle
Bilgisayar
Pano
Site önizlemesi
Agent'tan düzeltmesini iste
Agent'tan çalıştırma talimatlarını yazmasını iste
Lütfen çalıştırma talimatlarını .oceanleo/run.json dosyasına yazın.
İstek başarısız oldu. Lütfen yeniden deneyin.
Yol / ile başlamalı ve yalnızca bu site içinde gezinmelidir.
Çalışma günlükleri
Önizlemeye dön
Yeniden başlat
Önizleme URL'si henüz kullanılamıyor.
Önizleme yolu
SQL konsolu
Birincil alan adı
Kod deposu
Bu ölçümler site projesi API'sinden gelir. Döndürülmeyen ölçümler kullanılamaz durumda kalır.
Analiz durumu
.ws.oceanleo.app üzerinde yayımla
Alan adı
Alan adı eklendi
Depolanan dosya listesi
Depolama kovası
Depolama kullanımı
Geri alma dağıtımı oluşturuldu
Geri yükleme commit'i {commit} oluşturuldu
Yayımlama isteği gönderildi
Geçerli commit
Yeni commit olarak geri yükle
Site sürümü {commit} geri yüklensin
Maliyet kayıtları
Maliyet kayıtları geçici olarak kullanılamıyor.
Teknoloji yığını
Fiyatlandırılmamış
Bağlanmamış
Site verileri yükleniyor…
Bu kovada henüz dosya yok.
Bu sitenin henüz maliyet kaydı yok.
Ortam
Ortam değişkeni referansları
Kullanım ve maliyet
Site çalışma alanı
Ziyaretler
SQL çalıştır
Örneğin: portföy ve iletişim bilgileri içeren sade bir site
Site oluştur
Oluşturmak istediğiniz siteyi açıklayın
Yeni site
`),
  ja: lines(`
4 時間
Agent の操作ごとに承認を求める
有効にできるのは自分のアカウントだけです。時間が切れると自動で無効になります。このパソコンのトレイから停止することもできます。
Agent にこのデバイスの操作を許可
クラウドアシスタントにこのパソコンの使用を許可
画面の操作を許可（表示、クリック、入力）
許可する時間
無効にしても Agent のリクエストは表示されますが、リモート操作は自動では許可されません。
有効にすると、Agent のリクエストごとにこのパソコンでの確認を待ちます。
自分のアカウントからはこのデバイスに直接接続できます。リモートアクセスとクラウドアシスタントの権限をここで設定します。
アクセスと操作
検索を閉じる
一致するタスクはありません。
共同作業の接続が切れました。再試行中
すべての素材
Library で表示
全 {total} 件
データなし
ダッシュボードのデータを一時的に利用できません。
Agent にこのダッシュボードの設定を依頼
このダッシュボードはまだ接続されていません。
選択をキャンセル
参照を挿入できませんでした。参照は保持されています。もう一度挿入してください。
スクリーンショットを撮れませんでした。位置の参照は引き続き送信できます。
このサイトの Agent チャットを開けませんでした。もう一度お試しください。
Agent チャットを開いて入力欄を待っています…
スクリーンショットを追加
プレビュー内をクリックすると、座標とスクリーンショットの参照がチャット入力欄に追加されます。
要素を選択
Agent チャットの入力欄の待機がタイムアウトしました。参照は保持されています。もう一度挿入してください。
座標をプレビューに合わせるため、現在のタブを撮影してください。
別オリジンのプレビューではクリック座標のみを記録し、ページの DOM は読み取りません。
挿入を再試行
タスクを作成しました
起動
スリープ解除
Agent タスクを開く
ログはまだありません
ダッシュボードはまだありません
実行ログを表示
パソコン
ダッシュボード
サイトのプレビュー
Agent に修正を依頼
Agent に実行手順の記入を依頼
.oceanleo/run.json に実行手順を記入してください。
リクエストに失敗しました。もう一度お試しください。
パスは / で始め、移動先は現在のサイト内に限定してください。
実行ログ
プレビューに戻る
再起動
プレビュー URL はまだ利用できません。
プレビューパス
SQL コンソール
メインドメイン
リポジトリ
これらの値はサイトプロジェクトの API から取得します。返されない指標は利用不可のまま表示されます。
分析の状態
.ws.oceanleo.app に公開
ドメイン
ドメインを追加しました
保存ファイル一覧
ストレージバケット
ストレージ使用量
ロールバック用デプロイを作成しました
復元コミット {commit} を作成しました
公開リクエストを送信しました
現在のコミット
新しいコミットとして復元
サイトのバージョン {commit} を復元
費用の記録
費用の記録を一時的に利用できません。
技術スタック
価格未設定
未連携
サイトのデータを読み込み中…
このバケットにはまだファイルがありません。
このサイトにはまだ費用の記録がありません。
環境
環境変数の参照
使用量と費用
サイトワークスペース
アクセス数
SQL を実行
例：作品集と連絡先を掲載するシンプルなサイト
サイトを作成
作りたいサイトを説明してください
新しいサイト
`),
  ko: lines(`
4시간
Agent가 제어할 때마다 승인 요청
본인 계정만 켤 수 있습니다. 시간이 지나면 자동으로 꺼지며 이 컴퓨터의 시스템 트레이에서도 중지할 수 있습니다.
Agent가 이 기기를 제어하도록 허용
클라우드 도우미가 이 컴퓨터를 사용하도록 허용
화면 제어 허용(보기, 클릭, 입력)
허용 시간
끄면 Agent 요청은 계속 표시되지만 원격 제어 권한은 자동으로 부여되지 않습니다.
켜면 Agent가 요청할 때마다 이 컴퓨터에서 확인을 기다립니다.
본인 계정으로는 이 기기에 바로 연결됩니다. 여기에서 원격 액세스와 클라우드 도우미 권한을 설정하세요.
액세스 및 제어
검색 닫기
일치하는 작업이 없습니다.
협업 연결이 끊겼습니다. 다시 시도 중
모든 자료
Library에서 보기
총 {total}개 항목
데이터 없음
대시보드 데이터를 일시적으로 사용할 수 없습니다.
Agent에게 이 대시보드 설정 요청
이 대시보드는 아직 연결되지 않았습니다.
선택 취소
참조를 삽입하지 못했습니다. 참조는 보관되었으니 다시 삽입해 주세요.
스크린샷을 찍지 못했습니다. 위치 참조는 계속 보낼 수 있습니다.
이 웹사이트의 Agent 채팅을 열지 못했습니다. 다시 시도해 주세요.
Agent 채팅을 열고 입력란을 기다리는 중…
스크린샷 추가
미리보기에서 위치를 클릭하면 좌표와 스크린샷 참조가 채팅 입력란에 추가됩니다.
요소 선택
Agent 채팅 입력란 대기 시간이 초과되었습니다. 참조는 보관되었으니 다시 삽입해 주세요.
좌표가 미리보기와 일치하도록 현재 탭을 캡처해 주세요.
다른 출처의 미리보기는 클릭 좌표만 기록하며 페이지 DOM을 읽지 않습니다.
삽입 다시 시도
작업이 생성되었습니다
시작
깨우기
Agent 작업 열기
아직 로그가 없습니다
아직 대시보드가 없습니다
실행 로그 보기
컴퓨터
대시보드
웹사이트 미리보기
Agent에게 수정 요청
Agent에게 실행 지침 작성 요청
.oceanleo/run.json에 실행 지침을 작성해 주세요.
요청에 실패했습니다. 다시 시도해 주세요.
경로는 /로 시작해야 하며 현재 웹사이트 안에서만 이동할 수 있습니다.
실행 로그
미리보기로 돌아가기
다시 시작
미리보기 URL을 아직 사용할 수 없습니다.
미리보기 경로
SQL 콘솔
기본 도메인
저장소
이 수치는 웹사이트 프로젝트 API에서 가져옵니다. 반환되지 않은 측정값은 사용할 수 없음으로 유지됩니다.
분석 상태
.ws.oceanleo.app에 게시
도메인
도메인이 추가되었습니다
저장된 파일 목록
스토리지 버킷
스토리지 사용량
롤백 배포가 생성되었습니다
복원 커밋 {commit}이 생성되었습니다
게시 요청이 제출되었습니다
현재 커밋
새 커밋으로 복원
웹사이트 버전 {commit} 복원
비용 기록
비용 기록을 일시적으로 사용할 수 없습니다.
기술 스택
가격 미설정
연결되지 않음
웹사이트 데이터 읽는 중…
이 버킷에는 아직 파일이 없습니다.
이 웹사이트에는 아직 비용 기록이 없습니다.
환경
환경 변수 참조
사용량 및 비용
웹사이트 작업 공간
방문 수
SQL 실행
예: 포트폴리오와 연락처를 보여 주는 간단한 웹사이트
웹사이트 만들기
만들고 싶은 웹사이트를 설명해 주세요
새 웹사이트
`),
  es: lines(`
4 horas
Pedir permiso cada vez que Agent tome el control
Solo tu cuenta puede activar esta opción. Se desactiva al terminar el plazo; también puedes detenerla desde la bandeja del sistema de este ordenador.
Permitir que Agent controle este dispositivo
Permitir que el asistente en la nube use este ordenador
Permitir el control de pantalla (ver, hacer clic, escribir)
Duración del permiso
Si está desactivado, las solicitudes de Agent seguirán apareciendo, pero no se concederá el control remoto automáticamente.
Si está activado, cada solicitud de Agent esperará confirmación en este ordenador.
Tu propia cuenta se conecta directamente a este dispositivo. Configura aquí los permisos de acceso remoto y del asistente en la nube.
Acceso y control
Cerrar búsqueda
No hay tareas coincidentes.
Se perdió la conexión de colaboración. Reintentando
Todos los recursos
Ver en Library
{total} registros en total
Sin datos
Los datos del panel no están disponibles temporalmente.
Pedir a Agent que configure este panel
Este panel aún no está conectado.
Cancelar selección
No se pudo insertar la referencia. Se ha conservado; vuelve a intentar insertarla.
No se pudo hacer la captura. Puedes enviar la referencia de ubicación igualmente.
No se pudo abrir el chat de Agent de este sitio. Inténtalo de nuevo.
Abriendo el chat de Agent y esperando el campo de entrada…
Añadir captura de pantalla
Haz clic en un punto de la vista previa para añadir sus coordenadas y la referencia de captura al campo de entrada del chat.
Seleccionar elemento
Se agotó el tiempo de espera del campo de entrada de Agent. Se ha conservado la referencia; vuelve a intentar insertarla.
Captura la pestaña actual para que las coordenadas coincidan con la vista previa.
Las vistas previas de otro origen solo registran las coordenadas de los clics; no leen el DOM de la página.
Reintentar inserción
Tarea creada
Iniciar
Activar
Abrir tarea de Agent
Aún no hay registros
Aún no hay paneles
Ver registros de ejecución
Ordenador
Panel
Vista previa del sitio
Pedir a Agent que lo repare
Pedir a Agent que escriba las instrucciones de ejecución
Escribe las instrucciones de ejecución en .oceanleo/run.json.
La solicitud ha fallado. Inténtalo de nuevo.
La ruta debe empezar por / y solo puede navegar dentro de este sitio.
Registros de ejecución
Volver a la vista previa
Reiniciar
La URL de vista previa aún no está disponible.
Ruta de vista previa
Consola SQL
Dominio principal
Repositorio
Estas lecturas proceden de la API del proyecto del sitio. Las métricas que no se devuelvan seguirán sin estar disponibles.
Estado del análisis
Publicar en .ws.oceanleo.app
Dominio
Dominio añadido
Lista de archivos almacenados
Contenedor de almacenamiento
Uso de almacenamiento
Despliegue de reversión creado
Commit de restauración {commit} creado
Publicación enviada
Commit actual
Restaurar como nuevo commit
Restaurar la versión {commit} del sitio
Registros de costes
Los registros de costes no están disponibles temporalmente.
Tecnologías utilizadas
Sin precio definido
Sin vincular
Cargando datos del sitio…
Este contenedor aún no tiene archivos.
Este sitio aún no tiene registros de costes.
Entorno
Referencias a variables de entorno
Uso y costes
Espacio de trabajo del sitio
Visitas
Ejecutar SQL
Por ejemplo: un sitio sencillo con un portafolio y datos de contacto
Crear sitio
Describe el sitio que quieres crear
Nuevo sitio
`),
  it: lines(`
4 ore
Richiedi conferma ogni volta che Agent prende il controllo
Solo il tuo account può attivare questa opzione. Si disattiva allo scadere del tempo; puoi anche interromperla dall'area di notifica di questo computer.
Consenti ad Agent di controllare questo dispositivo
Consenti all'assistente cloud di usare questo computer
Consenti il controllo dello schermo (visualizzare, fare clic, digitare)
Durata del permesso
Se disattivato, le richieste di Agent restano visibili, ma il controllo remoto non viene concesso automaticamente.
Se attivato, ogni richiesta di Agent attende conferma su questo computer.
Il tuo account si collega direttamente a questo dispositivo. Imposta qui i permessi di accesso remoto e dell'assistente cloud.
Accesso e controllo
Chiudi ricerca
Nessuna attività corrispondente.
Connessione di collaborazione interrotta. Nuovo tentativo
Tutte le risorse
Visualizza in Library
{total} record in totale
Nessun dato
I dati della dashboard non sono temporaneamente disponibili.
Chiedi ad Agent di configurare questa dashboard
Questa dashboard non è ancora collegata.
Annulla selezione
Impossibile inserire il riferimento. È stato conservato; riprova a inserirlo.
Impossibile acquisire lo screenshot. Puoi comunque inviare il riferimento alla posizione.
Impossibile aprire la chat Agent di questo sito. Riprova.
Apertura della chat Agent e attesa del campo di inserimento…
Aggiungi screenshot
Fai clic su un punto dell'anteprima per aggiungere le coordinate e il riferimento allo screenshot nel campo della chat.
Seleziona elemento
Tempo scaduto in attesa del campo della chat Agent. Il riferimento è stato conservato; riprova a inserirlo.
Acquisisci la scheda corrente affinché le coordinate corrispondano all'anteprima.
Le anteprime di altra origine registrano solo le coordinate dei clic; non leggono il DOM della pagina.
Riprova inserimento
Attività creata
Avvia
Riattiva
Apri attività Agent
Nessun log per ora
Nessuna dashboard per ora
Visualizza log di esecuzione
Computer
Dashboard
Anteprima del sito
Chiedi ad Agent di correggere
Chiedi ad Agent di scrivere le istruzioni di esecuzione
Scrivi le istruzioni di esecuzione in .oceanleo/run.json.
Richiesta non riuscita. Riprova.
Il percorso deve iniziare con / e può navigare solo all'interno di questo sito.
Log di esecuzione
Torna all'anteprima
Riavvia
L'URL dell'anteprima non è ancora disponibile.
Percorso dell'anteprima
Console SQL
Dominio principale
Repository
Queste misurazioni provengono dall'API del progetto del sito. Le metriche non restituite restano non disponibili.
Stato dell'analisi
Pubblica su .ws.oceanleo.app
Dominio
Dominio aggiunto
Elenco dei file archiviati
Bucket di archiviazione
Utilizzo dello spazio
Distribuzione di rollback creata
Commit di ripristino {commit} creato
Pubblicazione inviata
Commit corrente
Ripristina come nuovo commit
Ripristina la versione {commit} del sito
Registrazioni dei costi
Le registrazioni dei costi non sono temporaneamente disponibili.
Stack tecnologico
Prezzo non definito
Non collegato
Caricamento dei dati del sito…
Questo bucket non contiene ancora file.
Questo sito non ha ancora registrazioni dei costi.
Ambiente
Riferimenti alle variabili d'ambiente
Utilizzo e costi
Area di lavoro del sito
Visite
Esegui SQL
Ad esempio: un sito semplice con portfolio e recapiti
Crea sito
Descrivi il sito che vuoi creare
Nuovo sito
`),
  "pt-BR": lines(`
4 horas
Pedir aprovação sempre que Agent assumir o controle
Somente sua conta pode ativar esta opção. Ela é desativada ao fim do prazo; você também pode interrompê-la pela bandeja do sistema deste computador.
Permitir que Agent controle este dispositivo
Permitir que o assistente na nuvem use este computador
Permitir controle da tela (visualizar, clicar, digitar)
Duração da permissão
Quando desativado, as solicitações de Agent continuam aparecendo, mas o controle remoto não é concedido automaticamente.
Quando ativado, cada solicitação de Agent aguarda confirmação neste computador.
Sua própria conta se conecta diretamente a este dispositivo. Defina aqui as permissões de acesso remoto e do assistente na nuvem.
Acesso e controle
Fechar busca
Nenhuma tarefa correspondente.
Conexão de colaboração interrompida. Tentando novamente
Todos os recursos
Ver na Library
{total} registros no total
Sem dados
Os dados do painel estão temporariamente indisponíveis.
Pedir a Agent para configurar este painel
Este painel ainda não está conectado.
Cancelar seleção
Não foi possível inserir a referência. Ela foi preservada; tente inseri-la novamente.
Não foi possível capturar a tela. Você ainda pode enviar a referência de posição.
Não foi possível abrir o chat de Agent deste site. Tente novamente.
Abrindo o chat de Agent e aguardando o campo de entrada…
Adicionar captura de tela
Clique em um ponto da prévia para adicionar as coordenadas e a referência da captura ao campo de entrada do chat.
Selecionar elemento
O tempo de espera pelo campo do chat de Agent esgotou. A referência foi preservada; tente inseri-la novamente.
Capture a aba atual para que as coordenadas correspondam à prévia.
Prévias de outra origem registram apenas as coordenadas dos cliques; não leem o DOM da página.
Tentar inserir novamente
Tarefa criada
Iniciar
Reativar
Abrir tarefa de Agent
Ainda não há logs
Ainda não há painéis
Ver logs de execução
Computador
Painel
Prévia do site
Pedir a Agent para corrigir
Pedir a Agent para escrever as instruções de execução
Escreva as instruções de execução em .oceanleo/run.json.
A solicitação falhou. Tente novamente.
O caminho deve começar com / e só pode navegar dentro deste site.
Logs de execução
Voltar à prévia
Reiniciar
A URL da prévia ainda não está disponível.
Caminho da prévia
Console SQL
Domínio principal
Repositório
Estas leituras vêm da API do projeto do site. Métricas não retornadas continuam indisponíveis.
Status da análise
Publicar em .ws.oceanleo.app
Domínio
Domínio adicionado
Lista de arquivos armazenados
Bucket de armazenamento
Uso de armazenamento
Implantação de reversão criada
Commit de restauração {commit} criado
Publicação enviada
Commit atual
Restaurar como novo commit
Restaurar a versão {commit} do site
Registros de custos
Os registros de custos estão temporariamente indisponíveis.
Stack de tecnologia
Sem preço definido
Não vinculado
Carregando dados do site…
Este bucket ainda não tem arquivos.
Este site ainda não tem registros de custos.
Ambiente
Referências a variáveis de ambiente
Uso e custos
Área de trabalho do site
Visitas
Executar SQL
Por exemplo: um site simples com portfólio e informações de contato
Criar site
Descreva o site que deseja criar
Novo site
`),
  en: lines(`
4 hours
Require approval every time Agent takes control
Only your account can enable this. It turns off automatically when time runs out, or you can stop it from this computer's tray.
Allow Agent to control this device
Allow the cloud assistant to use this computer
Allow screen control (view, click, type)
Permission duration
When off, Agent requests still appear, but remote control is not granted automatically.
When on, every Agent request waits for approval on this computer.
Your own account connects directly to this device. Set remote access and cloud assistant permissions here.
Access and control
Close search
No matching tasks.
Collaboration disconnected. Retrying
All assets
View in Library
{total} records in total
No data
Dashboard data is temporarily unavailable.
Ask Agent to configure this dashboard
This dashboard is not connected yet.
Cancel selection
Could not insert the reference. It has been kept; try inserting it again.
Could not take a screenshot. You can still send the location reference.
Could not open this website's Agent chat. Please try again.
Opening Agent chat and waiting for the input field…
Add screenshot
Click a location in the preview to add its coordinates and screenshot reference to the chat input.
Pick element
Timed out waiting for the Agent chat input. The reference has been kept; try inserting it again.
Capture the current tab so the coordinates match the preview.
Cross-origin previews record click coordinates only; they do not read the page DOM.
Retry insertion
Task created
Start
Wake
Open Agent task
No logs yet
No dashboards yet
View runtime logs
Computer
Dashboard
Website preview
Ask Agent to fix it
Ask Agent to write run instructions
Please write the run instructions in .oceanleo/run.json.
Request failed. Please try again.
The path must start with / and can only navigate within this website.
Runtime logs
Back to preview
Restart
The preview URL is not available yet.
Preview path
SQL console
Primary domain
Repository
These readings come from the website project API. Metrics not returned remain unavailable.
Analytics status
Publish to .ws.oceanleo.app
Domain
Domain added
Stored file list
Storage bucket
Storage usage
Rollback deployment created
Restore commit {commit} created
Publication submitted
Current commit
Restore as a new commit
Restore website version {commit}
Cost records
Cost records are temporarily unavailable.
Technology stack
Not priced
Not linked
Loading website data…
This bucket has no files yet.
This website has no cost records yet.
Environment
Environment variable references
Usage and cost
Website workbench
Visits
Run SQL
For example: a simple website with a portfolio and contact details
Create website
Describe the website you want to build
New website
`),
  "zh-TW": lines(`
4 小時
Agent 每次控制都要同意
僅你的帳號可以開啟；時間到會自動關閉，也可以在這台電腦的系統匣中停止。
允許 Agent 控制此裝置
允許雲端助理使用這台電腦
允許操作螢幕（檢視、點擊、輸入）
允許時長
關閉後，Agent 申請仍會顯示，但不會自動取得遠端控制權。
開啟後，Agent 每次申請都會在這台電腦上等待確認。
自己的帳號存取這台裝置會直接連線。遠端存取和雲端助理的權限在這裡設定。
存取與控制
關閉搜尋
沒有符合的任務。
協作連線已中斷，正在重試
所有素材
在 Library 中檢視
共 {total} 筆
無資料
儀表板資料暫時無法使用。
讓 Agent 設定此儀表板
此儀表板尚未連接資料。
取消點選
無法插入引用，引用已保留，請重試插入。
無法擷取螢幕截圖，仍可傳送位置引用。
無法開啟此網站的 Agent 對話，請重試。
正在開啟 Agent 對話並等待輸入框…
新增螢幕截圖
點擊預覽位置，將座標和螢幕截圖引用放入對話輸入框。
點選元素
等待 Agent 對話輸入框逾時，引用已保留，請重試插入。
請擷取目前分頁，以便座標對應預覽。
跨來源預覽僅記錄點擊座標，不讀取頁面 DOM。
重試插入
任務已建立
啟動
喚醒
開啟 Agent 任務
暫無記錄
暫無儀表板
檢視執行記錄
電腦
儀表板
網站預覽
讓 Agent 修復
讓 Agent 寫入執行說明
請寫入 .oceanleo/run.json 執行說明。
請求失敗，請重試。
路徑須以 / 開頭，且只能在目前網站內跳轉。
執行記錄
返回預覽
重新啟動
預覽網址尚未可用。
預覽路徑
SQL 主控台
主要網域
儲存庫
以下讀值來自網站專案 API；未傳回的計量維持不可用。
分析狀態
發佈至 .ws.oceanleo.app
網域
已新增網域
儲存檔案清單
儲存貯體
儲存空間用量
已建立回復部署
已建立還原提交 {commit}
已提交發佈
目前提交
還原為新提交
還原網站版本 {commit}
成本記錄
成本記錄暫時無法使用。
技術堆疊
尚未定價
尚未綁定
正在讀取網站資料…
此儲存貯體尚無檔案。
此網站尚無成本記錄。
環境
環境變數引用
用量與成本
網站工作台
造訪次數
執行 SQL
例如：展示作品集與聯絡資訊的簡潔網站
建立網站
描述你想製作的網站
新建網站
`),
  de: lines(`
4 Stunden
Jede Steuerung durch Agent bestätigen
Nur dein Konto kann dies aktivieren. Nach Ablauf der Zeit wird es automatisch deaktiviert; du kannst es auch im Infobereich dieses Computers stoppen.
Agent darf dieses Gerät steuern
Cloud-Assistent darf diesen Computer verwenden
Bildschirmsteuerung erlauben (ansehen, klicken, tippen)
Dauer der Berechtigung
Wenn deaktiviert, werden Anfragen von Agent weiterhin angezeigt, aber die Fernsteuerung wird nicht automatisch erlaubt.
Wenn aktiviert, wartet jede Anfrage von Agent auf eine Bestätigung an diesem Computer.
Dein eigenes Konto verbindet sich direkt mit diesem Gerät. Hier legst du die Berechtigungen für Fernzugriff und Cloud-Assistent fest.
Zugriff und Steuerung
Suche schließen
Keine passenden Aufgaben.
Zusammenarbeit unterbrochen. Neuer Verbindungsversuch
Alle Materialien
In Library ansehen
Insgesamt {total} Einträge
Keine Daten
Dashboard-Daten sind vorübergehend nicht verfügbar.
Agent mit der Einrichtung dieses Dashboards beauftragen
Dieses Dashboard ist noch nicht angebunden.
Auswahl abbrechen
Der Verweis konnte nicht eingefügt werden. Er wurde gespeichert; versuche es erneut.
Screenshot fehlgeschlagen. Du kannst den Positionsverweis trotzdem senden.
Der Agent-Chat dieser Website konnte nicht geöffnet werden. Bitte versuche es erneut.
Agent-Chat wird geöffnet, Eingabefeld wird erwartet…
Screenshot hinzufügen
Klicke auf eine Stelle in der Vorschau, um ihre Koordinaten und den Screenshot-Verweis in das Chat-Eingabefeld einzufügen.
Element auswählen
Zeitüberschreitung beim Warten auf das Agent-Chat-Eingabefeld. Der Verweis wurde gespeichert; versuche das Einfügen erneut.
Erstelle einen Screenshot des aktuellen Tabs, damit die Koordinaten zur Vorschau passen.
Bei Vorschauen anderer Ursprünge werden nur Klickkoordinaten erfasst; das Seiten-DOM wird nicht gelesen.
Erneut einfügen
Aufgabe erstellt
Starten
Aufwecken
Agent-Aufgabe öffnen
Noch keine Protokolle
Noch keine Dashboards
Laufzeitprotokolle ansehen
Computer
Dashboard
Website-Vorschau
Agent mit der Reparatur beauftragen
Agent mit der Erstellung der Startanweisungen beauftragen
Bitte schreibe die Startanweisungen in .oceanleo/run.json.
Anfrage fehlgeschlagen. Bitte versuche es erneut.
Der Pfad muss mit / beginnen und darf nur innerhalb dieser Website navigieren.
Laufzeitprotokolle
Zurück zur Vorschau
Neu starten
Die Vorschau-URL ist noch nicht verfügbar.
Vorschaupfad
SQL-Konsole
Hauptdomain
Repository
Diese Messwerte stammen aus der Website-Projekt-API. Nicht zurückgegebene Messwerte bleiben nicht verfügbar.
Analysestatus
Auf .ws.oceanleo.app veröffentlichen
Domain
Domain hinzugefügt
Liste gespeicherter Dateien
Speicher-Bucket
Speichernutzung
Rollback-Bereitstellung erstellt
Wiederherstellungs-Commit {commit} erstellt
Veröffentlichung eingereicht
Aktueller Commit
Als neuen Commit wiederherstellen
Website-Version {commit} wiederherstellen
Kosteneinträge
Kosteneinträge sind vorübergehend nicht verfügbar.
Technologie-Stack
Ohne Preis
Nicht verknüpft
Website-Daten werden geladen…
Dieser Bucket enthält noch keine Dateien.
Für diese Website gibt es noch keine Kosteneinträge.
Umgebung
Umgebungsvariablen-Verweise
Nutzung und Kosten
Website-Arbeitsbereich
Besuche
SQL ausführen
Zum Beispiel: eine schlichte Website mit Portfolio und Kontaktdaten
Website erstellen
Beschreibe die Website, die du erstellen möchtest
Neue Website
`),
  fr: lines(`
4 heures
Exiger une autorisation à chaque prise de contrôle par Agent
Seul votre compte peut activer cette option. Elle se désactive automatiquement à la fin du délai ; vous pouvez aussi l'arrêter depuis la zone de notification de cet ordinateur.
Autoriser Agent à contrôler cet appareil
Autoriser l'assistant cloud à utiliser cet ordinateur
Autoriser le contrôle de l'écran (voir, cliquer, saisir)
Durée de l'autorisation
Si cette option est désactivée, les demandes d'Agent restent visibles, mais le contrôle à distance n'est pas accordé automatiquement.
Si cette option est activée, chaque demande d'Agent attend une confirmation sur cet ordinateur.
Votre propre compte se connecte directement à cet appareil. Réglez ici les autorisations d'accès à distance et de l'assistant cloud.
Accès et contrôle
Fermer la recherche
Aucune tâche correspondante.
Connexion collaborative interrompue. Nouvelle tentative
Toutes les ressources
Voir dans Library
{total} entrées au total
Aucune donnée
Les données du tableau de bord sont temporairement indisponibles.
Demander à Agent de configurer ce tableau de bord
Ce tableau de bord n'est pas encore connecté.
Annuler la sélection
Impossible d'insérer la référence. Elle a été conservée ; réessayez de l'insérer.
Impossible de prendre une capture d'écran. Vous pouvez toujours envoyer la référence de position.
Impossible d'ouvrir la conversation Agent de ce site. Veuillez réessayer.
Ouverture de la conversation Agent et attente du champ de saisie…
Ajouter une capture d'écran
Cliquez dans l'aperçu pour ajouter les coordonnées et la référence de capture au champ de saisie de la conversation.
Sélectionner un élément
Le délai d'attente du champ de saisie Agent a expiré. La référence a été conservée ; réessayez de l'insérer.
Capturez l'onglet actuel pour que les coordonnées correspondent à l'aperçu.
Les aperçus d'une autre origine enregistrent uniquement les coordonnées des clics ; ils ne lisent pas le DOM de la page.
Réessayer l'insertion
Tâche créée
Démarrer
Réveiller
Ouvrir la tâche Agent
Aucun journal pour le moment
Aucun tableau de bord pour le moment
Voir les journaux d'exécution
Ordinateur
Tableau de bord
Aperçu du site
Demander à Agent de réparer
Demander à Agent de rédiger les instructions d'exécution
Veuillez écrire les instructions d'exécution dans .oceanleo/run.json.
La demande a échoué. Veuillez réessayer.
Le chemin doit commencer par / et rester dans ce site.
Journaux d'exécution
Retour à l'aperçu
Redémarrer
L'URL de l'aperçu n'est pas encore disponible.
Chemin de l'aperçu
Console SQL
Domaine principal
Dépôt
Ces mesures proviennent de l'API du projet de site. Les mesures non renvoyées restent indisponibles.
État de l'analyse
Publier sur .ws.oceanleo.app
Domaine
Domaine ajouté
Liste des fichiers stockés
Compartiment de stockage
Utilisation du stockage
Déploiement de retour arrière créé
Commit de restauration {commit} créé
Publication soumise
Commit actuel
Restaurer dans un nouveau commit
Restaurer la version {commit} du site
Relevés de coûts
Les relevés de coûts sont temporairement indisponibles.
Pile technologique
Tarif non défini
Non associé
Chargement des données du site…
Ce compartiment ne contient pas encore de fichiers.
Ce site n'a pas encore de relevés de coûts.
Environnement
Références aux variables d'environnement
Utilisation et coûts
Espace de travail du site
Visites
Exécuter SQL
Par exemple : un site simple présentant un portfolio et des coordonnées
Créer un site
Décrivez le site que vous souhaitez créer
Nouveau site
`),
};

// Shared Spanish wording is translated once; regional vocabulary stays local.
const ALL_TRANSLATIONS: Record<Exclude<Locale, "zh">, readonly string[]> = {
  ...TRANSLATIONS,
  "es-419": TRANSLATIONS.es.map((text) => text
    .replaceAll("este ordenador", "esta computadora")
    .replaceAll("ordenador", "computadora")
    .replaceAll("Ordenador", "Computadora")
    .replaceAll("añadir", "agregar")
    .replaceAll("Añadir", "Agregar")
    .replaceAll("añadido", "agregado")
    .replaceAll("costes", "costos")
    .replaceAll("Se ha conservado", "Se conservó")
    .replaceAll("ha fallado", "falló")),
};

export const BUILD_1103_GAP_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(LOCALES.map((locale) => {
    const translated = locale === "zh" ? SOURCE : ALL_TRANSLATIONS[locale];
    if (translated.length !== SOURCE.length) {
      throw new Error(`build-1103-gap-copy: ${locale} has ${translated.length} rows; expected ${SOURCE.length}`);
    }
    return [locale, Object.fromEntries(SOURCE.flatMap((key, index) => {
      // These two base entries predate this table; fill only the missing locales.
      if (key === "在 Library 中查看" && (locale === "zh" || locale === "en")) return [];
      return [[key, translated[index]]];
    }))];
  })) as Record<Locale, Record<string, string>>;
