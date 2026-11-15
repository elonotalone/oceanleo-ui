import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  notes: "查看演讲备注",
  back: "返回幻灯片",
  oneWindow: "当前环境只支持一个窗口。演讲备注、下一页和计时在这里查看。",
} as const;

export const PW_UD_MESSAGES = assembleCopy(SOURCE, {
  en: { notes: "Speaker notes", back: "Back to slides", oneWindow: "This environment supports one window. View speaker notes, the next slide and the timer here." },
  de: { notes: "Vortragsnotizen", back: "Zurück zu den Folien", oneWindow: "Diese Umgebung unterstützt ein Fenster. Hier finden Sie Vortragsnotizen, die nächste Folie und den Timer." },
  es: { notes: "Notas del presentador", back: "Volver a las diapositivas", oneWindow: "Este entorno admite una ventana. Aquí puedes ver las notas del presentador, la siguiente diapositiva y el temporizador." },
  "es-419": { notes: "Notas del presentador", back: "Volver a las diapositivas", oneWindow: "Este entorno admite una ventana. Aquí puedes ver las notas del presentador, la siguiente diapositiva y el temporizador." },
  fr: { notes: "Notes de présentation", back: "Revenir aux diapositives", oneWindow: "Cet environnement permet une seule fenêtre. Consultez ici les notes, la diapositive suivante et le minuteur." },
  it: { notes: "Note del relatore", back: "Torna alle diapositive", oneWindow: "Questo ambiente supporta una sola finestra. Qui trovi le note del relatore, la diapositiva successiva e il timer." },
  "pt-BR": { notes: "Notas do apresentador", back: "Voltar aos slides", oneWindow: "Este ambiente permite uma janela. Veja aqui as notas do apresentador, o próximo slide e o cronômetro." },
  "pt-PT": { notes: "Notas do apresentador", back: "Voltar aos diapositivos", oneWindow: "Este ambiente permite uma janela. Consulte aqui as notas do apresentador, o próximo diapositivo e o cronómetro." },
  vi: { notes: "Ghi chú thuyết trình", back: "Trở lại trang chiếu", oneWindow: "Môi trường này hỗ trợ một cửa sổ. Xem ghi chú thuyết trình, trang chiếu tiếp theo và bộ đếm giờ tại đây." },
  tr: { notes: "Konuşmacı notları", back: "Slaytlara dön", oneWindow: "Bu ortam tek pencereyi destekler. Konuşmacı notlarını, sonraki slaytı ve zamanlayıcıyı burada görebilirsiniz." },
  "zh-TW": { notes: "查看演講備註", back: "返回投影片", oneWindow: "目前環境只支援一個視窗。演講備註、下一頁和計時在這裡查看。" },
  ja: { notes: "発表者ノート", back: "スライドに戻る", oneWindow: "この環境ではウィンドウを1つだけ利用できます。発表者ノート、次のスライド、タイマーはこちらで確認できます。" },
  ko: { notes: "발표자 노트", back: "슬라이드로 돌아가기", oneWindow: "이 환경은 창 하나를 지원합니다. 발표자 노트, 다음 슬라이드와 타이머를 여기에서 확인하세요." },
  ar: { notes: "ملاحظات المتحدث", back: "العودة إلى الشرائح", oneWindow: "تدعم هذه البيئة نافذة واحدة. يمكنك الاطلاع هنا على ملاحظات المتحدث والشريحة التالية والمؤقت." },
  th: { notes: "บันทึกผู้บรรยาย", back: "กลับไปที่สไลด์", oneWindow: "สภาพแวดล้อมนี้รองรับหน้าต่างเดียว ดูบันทึกผู้บรรยาย สไลด์ถัดไป และตัวจับเวลาได้ที่นี่" },
  hi: { notes: "वक्ता के नोट्स", back: "स्लाइड पर लौटें", oneWindow: "इस परिवेश में एक विंडो का उपयोग किया जा सकता है। वक्ता के नोट्स, अगली स्लाइड और टाइमर यहाँ देखें।" },
});
