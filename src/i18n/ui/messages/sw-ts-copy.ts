import type { Locale } from "../../config";

export const SW_TS_COPY = {
  shareLink: "分享链接", collaborate: "共同协作", people: "有权访问的人", link: "有权访问者的链接",
  copyTask: "复制任务链接", collaborator: "协作者", help: "协作规则",
  snapshot: "仅分享选中的消息快照，不包含发送者姓名。",
  rules: "接受邀请后，协作者可以发送消息，继续所有者的智能体任务及已有电脑会话。云端智能体不能代协作者操作所有者的电脑。费用由所有者承担；协作者不能更换模型或电脑。所有者的其他连接和文件不会交给协作者。只有所有者可以邀请或移除成员；请把任务链接发给受邀者。移除后无法再协作或查看新内容，但仍可查看移除前的快照。",
} as const;
type Copy = Record<keyof typeof SW_TS_COPY, string>;
const translations: Record<Exclude<Locale, "zh">, Copy> = {
  en: {
    shareLink: "Share link", collaborate: "Collaborate", people: "People with access", link: "Link for people with access", copyTask: "Copy task link", collaborator: "Collaborator", help: "Collaboration rules",
    snapshot: "Shares a snapshot of selected messages without sender names.",
    rules: "After accepting an invite, collaborators can send messages to continue the owner's agent task and existing computer session. Cloud agents cannot operate the owner's computer for collaborators. The owner pays; collaborators cannot change the model or computer. The owner's other connections and files are not shared. Only the owner can invite or remove people; send invitees the task link. Removal ends collaboration and access to new content, while keeping the snapshot from before removal.",
  },
  de: {
    shareLink: "Freigabelink", collaborate: "Zusammenarbeiten", people: "Personen mit Zugriff", link: "Link für Personen mit Zugriff", copyTask: "Aufgabenlink kopieren", collaborator: "Mitwirkende", help: "Regeln zur Zusammenarbeit",
    snapshot: "Teilt eine Momentaufnahme ausgewählter Nachrichten ohne Absendernamen.",
    rules: "Nach Annahme der Einladung können Mitwirkende Nachrichten senden und die Agentenaufgabe sowie die bestehende Computersitzung des Eigentümers fortsetzen. Cloud-Agenten dürfen dessen Computer nicht für Mitwirkende bedienen. Der Eigentümer zahlt; Modell und Computer können nicht gewechselt werden. Andere Verbindungen und Dateien werden nicht freigegeben. Nur der Eigentümer lädt Personen ein oder entfernt sie. Sende Eingeladenen den Aufgabenlink. Entfernte Personen sehen keine neuen Inhalte, behalten aber die vorherige Momentaufnahme.",
  },
  es: {
    shareLink: "Enlace para compartir", collaborate: "Colaborar", people: "Personas con acceso", link: "Enlace para personas con acceso", copyTask: "Copiar enlace de la tarea", collaborator: "Colaborador", help: "Reglas de colaboración",
    snapshot: "Comparte una instantánea de los mensajes seleccionados sin nombres de remitentes.",
    rules: "Tras aceptar la invitación, los colaboradores pueden enviar mensajes para continuar la tarea del agente y la sesión de ordenador del propietario. Los agentes en la nube no pueden manejar su ordenador para colaboradores. El propietario paga; los colaboradores no pueden cambiar el modelo ni el ordenador. No se comparten otras conexiones ni archivos del propietario. Solo el propietario invita o elimina personas; envía el enlace de la tarea a los invitados. La eliminación impide colaborar y ver contenido nuevo, pero conserva la instantánea anterior.",
  },
  "es-419": {
    shareLink: "Enlace para compartir", collaborate: "Colaborar", people: "Personas con acceso", link: "Enlace para personas con acceso", copyTask: "Copiar enlace de la tarea", collaborator: "Colaborador", help: "Reglas de colaboración",
    snapshot: "Comparte una instantánea de los mensajes seleccionados sin nombres de remitentes.",
    rules: "Al aceptar la invitación, los colaboradores pueden enviar mensajes para continuar la tarea del agente y la sesión de computadora del propietario. Los agentes en la nube no pueden manejar su computadora para colaboradores. El propietario paga; los colaboradores no pueden cambiar el modelo ni la computadora. No se comparten otras conexiones ni archivos del propietario. Solo el propietario invita o elimina personas; envía el enlace a los invitados. La eliminación impide colaborar y ver contenido nuevo, pero conserva la instantánea anterior.",
  },
  fr: {
    shareLink: "Lien de partage", collaborate: "Collaborer", people: "Personnes ayant accès", link: "Lien pour les personnes autorisées", copyTask: "Copier le lien de la tâche", collaborator: "Collaborateur", help: "Règles de collaboration",
    snapshot: "Partage un instantané des messages sélectionnés sans nom d’expéditeur.",
    rules: "Après acceptation de l’invitation, les collaborateurs peuvent envoyer des messages pour poursuivre la tâche de l’agent et la session informatique du propriétaire. Les agents cloud ne peuvent pas utiliser son ordinateur pour les collaborateurs. Le propriétaire paie ; les collaborateurs ne peuvent changer ni modèle ni ordinateur. Ses autres connexions et fichiers ne sont pas partagés. Seul le propriétaire invite ou retire des personnes ; envoyez le lien aux invités. Le retrait bloque la collaboration et les nouveaux contenus, mais conserve l’instantané précédent.",
  },
  it: {
    shareLink: "Link di condivisione", collaborate: "Collabora", people: "Persone con accesso", link: "Link per le persone autorizzate", copyTask: "Copia link dell’attività", collaborator: "Collaboratore", help: "Regole di collaborazione",
    snapshot: "Condivide un’istantanea dei messaggi selezionati senza nomi dei mittenti.",
    rules: "Dopo aver accettato l’invito, i collaboratori possono inviare messaggi per continuare l’attività dell’agente e la sessione del computer del proprietario. Gli agenti cloud non possono usare il suo computer per i collaboratori. Il proprietario paga; i collaboratori non possono cambiare modello o computer. Le altre connessioni e i file del proprietario non vengono condivisi. Solo il proprietario invita o rimuove persone; invia il link agli invitati. La rimozione blocca collaborazione e nuovi contenuti, mantenendo l’istantanea precedente.",
  },
  "pt-BR": {
    shareLink: "Link de compartilhamento", collaborate: "Colaborar", people: "Pessoas com acesso", link: "Link para pessoas com acesso", copyTask: "Copiar link da tarefa", collaborator: "Colaborador", help: "Regras de colaboração",
    snapshot: "Compartilha uma cópia das mensagens selecionadas sem nomes de remetentes.",
    rules: "Após aceitar o convite, colaboradores podem enviar mensagens para continuar a tarefa do agente e a sessão do computador do proprietário. Agentes na nuvem não podem operar o computador dele para colaboradores. O proprietário paga; colaboradores não podem mudar o modelo ou computador. Outras conexões e arquivos não são compartilhados. Só o proprietário convida ou remove pessoas; envie o link aos convidados. A remoção encerra a colaboração e o acesso a novos conteúdos, mantendo a cópia anterior.",
  },
  "pt-PT": {
    shareLink: "Ligação de partilha", collaborate: "Colaborar", people: "Pessoas com acesso", link: "Ligação para pessoas com acesso", copyTask: "Copiar ligação da tarefa", collaborator: "Colaborador", help: "Regras de colaboração",
    snapshot: "Partilha uma cópia das mensagens selecionadas sem nomes dos remetentes.",
    rules: "Após aceitar o convite, os colaboradores podem enviar mensagens para continuar a tarefa do agente e a sessão do computador do proprietário. Os agentes na nuvem não podem operar o computador dele para colaboradores. O proprietário paga; os colaboradores não podem mudar o modelo ou computador. Outras ligações e ficheiros não são partilhados. Só o proprietário convida ou remove pessoas; envie a ligação aos convidados. A remoção termina a colaboração e o acesso a novos conteúdos, mantendo a cópia anterior.",
  },
  vi: {
    shareLink: "Liên kết chia sẻ", collaborate: "Cộng tác", people: "Người có quyền truy cập", link: "Liên kết cho người có quyền truy cập", copyTask: "Sao chép liên kết tác vụ", collaborator: "Cộng tác viên", help: "Quy tắc cộng tác",
    snapshot: "Chia sẻ bản chụp các tin nhắn đã chọn, không có tên người gửi.",
    rules: "Sau khi nhận lời mời, cộng tác viên có thể gửi tin nhắn để tiếp tục tác vụ của tác nhân và phiên máy tính hiện có của chủ sở hữu. Tác nhân đám mây không thể dùng máy tính của chủ sở hữu cho cộng tác viên. Chủ sở hữu trả phí; cộng tác viên không thể đổi mô hình hay máy tính. Các kết nối và tệp khác không được chia sẻ. Chỉ chủ sở hữu được mời hoặc xóa người; hãy gửi liên kết tác vụ cho người được mời. Khi bị xóa, họ không thể cộng tác hay xem nội dung mới, nhưng vẫn giữ bản chụp trước đó.",
  },
  tr: {
    shareLink: "Paylaşım bağlantısı", collaborate: "Birlikte çalış", people: "Erişimi olan kişiler", link: "Erişimi olan kişiler için bağlantı", copyTask: "Görev bağlantısını kopyala", collaborator: "İşbirlikçi", help: "İşbirliği kuralları",
    snapshot: "Seçili mesajların anlık kopyasını gönderen adları olmadan paylaşır.",
    rules: "Daveti kabul eden kişiler, sahibin ajan görevini ve mevcut bilgisayar oturumunu sürdürmek için mesaj gönderebilir. Bulut ajanları işbirlikçiler adına sahibin bilgisayarını kullanamaz. Ücreti sahip öder; işbirlikçiler modeli veya bilgisayarı değiştiremez. Sahibin diğer bağlantıları ve dosyaları paylaşılmaz. Yalnızca sahip davet edebilir veya kaldırabilir; davetlilere görev bağlantısını gönderin. Kaldırma, işbirliğini ve yeni içeriğe erişimi bitirir; önceki anlık kopya korunur.",
  },
  "zh-TW": {
    shareLink: "分享連結", collaborate: "共同協作", people: "有權存取的人", link: "有權存取者的連結", copyTask: "複製任務連結", collaborator: "協作者", help: "協作規則",
    snapshot: "僅分享所選訊息的快照，不包含傳送者姓名。",
    rules: "接受邀請後，協作者可以傳送訊息，繼續擁有者的智慧體任務及既有電腦工作階段。雲端智慧體不能代協作者操作擁有者的電腦。費用由擁有者承擔；協作者不能更換模型或電腦。擁有者的其他連線和檔案不會交給協作者。只有擁有者可以邀請或移除成員；請把任務連結傳給受邀者。移除後無法再協作或查看新內容，但仍可查看移除前的快照。",
  },
  ja: {
    shareLink: "共有リンク", collaborate: "共同作業", people: "アクセスできるユーザー", link: "アクセス権のある人向けリンク", copyTask: "タスクリンクをコピー", collaborator: "共同作業者", help: "共同作業のルール",
    snapshot: "選択したメッセージのスナップショットを送信者名なしで共有します。",
    rules: "招待を承諾すると、共同作業者はメッセージを送り、所有者のエージェントのタスクと既存のコンピューターセッションを続けられます。クラウドエージェントは共同作業者のために所有者のコンピューターを操作できません。費用は所有者が負担し、共同作業者はモデルやコンピューターを変更できません。所有者の他の接続やファイルは共有されません。招待と削除は所有者だけが行えます。招待した相手にタスクリンクを送ってください。削除後は共同作業と新しい内容へのアクセスが終了しますが、削除前のスナップショットは残ります。",
  },
  ko: {
    shareLink: "공유 링크", collaborate: "협업", people: "접근 권한이 있는 사람", link: "접근 권한이 있는 사람용 링크", copyTask: "작업 링크 복사", collaborator: "협업자", help: "협업 규칙",
    snapshot: "선택한 메시지의 스냅샷을 발신자 이름 없이 공유합니다.",
    rules: "초대를 수락한 협업자는 메시지를 보내 소유자의 에이전트 작업과 기존 컴퓨터 세션을 이어갈 수 있습니다. 클라우드 에이전트는 협업자를 위해 소유자의 컴퓨터를 조작할 수 없습니다. 비용은 소유자가 부담하며 협업자는 모델이나 컴퓨터를 변경할 수 없습니다. 소유자의 다른 연결과 파일은 공유되지 않습니다. 소유자만 사람을 초대하거나 제거할 수 있습니다. 초대받은 사람에게 작업 링크를 보내세요. 제거되면 협업과 새 콘텐츠 접근이 종료되지만 이전 스냅샷은 남습니다.",
  },
  ar: {
    shareLink: "رابط المشاركة", collaborate: "التعاون", people: "الأشخاص الذين لديهم وصول", link: "رابط للأشخاص المصرح لهم", copyTask: "نسخ رابط المهمة", collaborator: "متعاون", help: "قواعد التعاون",
    snapshot: "يشارك لقطة للرسائل المحددة دون أسماء المرسلين.",
    rules: "بعد قبول الدعوة، يمكن للمتعاونين إرسال رسائل لمتابعة مهمة وكيل المالك وجلسة الكمبيوتر الحالية. لا يمكن للوكلاء السحابيين تشغيل كمبيوتر المالك نيابة عن المتعاونين. يدفع المالك التكلفة، ولا يستطيع المتعاونون تغيير النموذج أو الكمبيوتر. لا تتم مشاركة اتصالات المالك وملفاته الأخرى. المالك وحده يدعو الأشخاص أو يزيلهم؛ أرسل رابط المهمة إلى المدعوين. تنهي الإزالة التعاون والوصول إلى المحتوى الجديد مع الاحتفاظ باللقطة السابقة.",
  },
  th: {
    shareLink: "ลิงก์แชร์", collaborate: "ทำงานร่วมกัน", people: "ผู้ที่มีสิทธิ์เข้าถึง", link: "ลิงก์สำหรับผู้ที่มีสิทธิ์เข้าถึง", copyTask: "คัดลอกลิงก์งาน", collaborator: "ผู้ร่วมงาน", help: "กติกาการทำงานร่วมกัน",
    snapshot: "แชร์ภาพบันทึกของข้อความที่เลือกโดยไม่แสดงชื่อผู้ส่ง",
    rules: "หลังยอมรับคำเชิญ ผู้ร่วมงานส่งข้อความเพื่อทำงานของเอเจนต์และเซสชันคอมพิวเตอร์เดิมของเจ้าของต่อได้ เอเจนต์บนคลาวด์ไม่สามารถใช้คอมพิวเตอร์ของเจ้าของแทนผู้ร่วมงาน เจ้าของเป็นผู้จ่ายค่าใช้จ่าย ผู้ร่วมงานเปลี่ยนโมเดลหรือคอมพิวเตอร์ไม่ได้ การเชื่อมต่อและไฟล์อื่นของเจ้าของจะไม่ถูกแชร์ มีเพียงเจ้าของที่เชิญหรือนำคนออกได้ โปรดส่งลิงก์งานให้ผู้รับเชิญ เมื่อนำออกจะร่วมงานหรือดูเนื้อหาใหม่ไม่ได้ แต่ยังดูภาพบันทึกก่อนนำออกได้",
  },
  hi: {
    shareLink: "साझा करने का लिंक", collaborate: "सहयोग करें", people: "ऐक्सेस वाले लोग", link: "ऐक्सेस वाले लोगों के लिए लिंक", copyTask: "टास्क लिंक कॉपी करें", collaborator: "सहयोगी", help: "सहयोग के नियम",
    snapshot: "चुने गए संदेशों का स्नैपशॉट भेजने वालों के नाम के बिना साझा करता है।",
    rules: "निमंत्रण स्वीकार करने के बाद सहयोगी संदेश भेजकर मालिक के एजेंट का टास्क और मौजूदा कंप्यूटर सत्र जारी रख सकते हैं। क्लाउड एजेंट सहयोगियों के लिए मालिक का कंप्यूटर नहीं चला सकते। खर्च मालिक देता है; सहयोगी मॉडल या कंप्यूटर नहीं बदल सकते। मालिक के अन्य कनेक्शन और फ़ाइलें साझा नहीं की जातीं। केवल मालिक लोगों को आमंत्रित या हटा सकता है; आमंत्रित लोगों को टास्क लिंक भेजें। हटाने पर सहयोग और नई सामग्री का ऐक्सेस समाप्त हो जाता है, लेकिन पहले का स्नैपशॉट बना रहता है।",
  },
};

export function swTsCopy(locale: Locale): Record<string, string> {
  const table = locale === "zh" ? SW_TS_COPY : translations[locale];
  return Object.fromEntries((Object.keys(SW_TS_COPY) as (keyof Copy)[]).map(key => [SW_TS_COPY[key], table[key]]));
}
