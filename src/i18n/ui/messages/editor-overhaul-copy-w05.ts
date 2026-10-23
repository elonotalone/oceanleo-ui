// 2026-10-23 编辑器整改波 W05 的新文案。只有 W05 改这一册。
// key = 中文原文（tt("…") 里那一句）；16 个非中文语种都要给，不许留中文。
//
// 「素材类别：表格」「素材类别：游戏」是库类型名的带语境 key（见
// `src/shell/library-editor-category.ts::translateLibraryTypeLabel`）：平铺词典里
// 「表格」= 插入表格的工具（Table）、「游戏」= 频道名（Games），类型菜单要的是
// Spreadsheet / Game。中文站回显 key 时由那个函数退回「表格」「游戏」。
import type { EditorOverhaulCopy } from "./editor-overhaul-copy-types";

export const EDITOR_OVERHAUL_W05_COPY: EditorOverhaulCopy = {
  de: {
    "显示上次成功加载的作品；列表暂未刷新。": "Zeigt die zuletzt geladenen Werke; die Liste wurde noch nicht aktualisiert.",
    "暂无内容预览，打开查看素材": "Keine Inhaltsvorschau. Zum Ansehen öffnen.",
    "视频画布": "Video-Leinwand",
    "素材类别：表格": "Tabelle",
    "素材类别：游戏": "Spiel",
  },
  en: {
    "显示上次成功加载的作品；列表暂未刷新。": "Showing the last loaded items; the list hasn’t refreshed yet.",
    "暂无内容预览，打开查看素材": "No content preview available. Open the item to view it.",
    "视频画布": "Video canvas",
    "素材类别：表格": "Spreadsheet",
    "素材类别：游戏": "Game",
  },
  es: {
    "显示上次成功加载的作品；列表暂未刷新。": "Se muestran los últimos elementos cargados; la lista aún no se ha actualizado.",
    "暂无内容预览，打开查看素材": "Sin vista previa del contenido. Ábrelo para verlo.",
    "视频画布": "Lienzo de vídeo",
    "素材类别：表格": "Hoja de cálculo",
    "素材类别：游戏": "Juego",
  },
  "es-419": {
    "显示上次成功加载的作品；列表暂未刷新。": "Se muestran los últimos elementos cargados; la lista aún no se actualizó.",
    "暂无内容预览，打开查看素材": "Sin vista previa del contenido. Ábrelo para verlo.",
    "视频画布": "Lienzo de video",
    "素材类别：表格": "Hoja de cálculo",
    "素材类别：游戏": "Juego",
  },
  fr: {
    "显示上次成功加载的作品；列表暂未刷新。": "Affichage des derniers éléments chargés ; la liste n’a pas encore été actualisée.",
    "暂无内容预览，打开查看素材": "Aucun aperçu du contenu. Ouvrez l’élément pour le voir.",
    "视频画布": "Canevas vidéo",
    "素材类别：表格": "Feuille de calcul",
    "素材类别：游戏": "Jeu",
  },
  it: {
    "显示上次成功加载的作品；列表暂未刷新。": "Mostra gli ultimi elementi caricati; l’elenco non è ancora aggiornato.",
    "暂无内容预览，打开查看素材": "Nessuna anteprima del contenuto. Aprilo per vederlo.",
    "视频画布": "Tela video",
    "素材类别：表格": "Foglio di calcolo",
    "素材类别：游戏": "Gioco",
  },
  "pt-BR": {
    "显示上次成功加载的作品；列表暂未刷新。": "Mostrando os últimos itens carregados; a lista ainda não foi atualizada.",
    "暂无内容预览，打开查看素材": "Sem prévia do conteúdo. Abra o item para ver.",
    "视频画布": "Tela de vídeo",
    "素材类别：表格": "Planilha",
    "素材类别：游戏": "Jogo",
  },
  "pt-PT": {
    "显示上次成功加载的作品；列表暂未刷新。": "A mostrar os últimos itens carregados; a lista ainda não foi atualizada.",
    "暂无内容预览，打开查看素材": "Sem pré-visualização do conteúdo. Abra o item para ver.",
    "视频画布": "Tela de vídeo",
    "素材类别：表格": "Folha de cálculo",
    "素材类别：游戏": "Jogo",
  },
  vi: {
    "显示上次成功加载的作品；列表暂未刷新。": "Đang hiển thị các mục tải gần nhất; danh sách chưa được làm mới.",
    "暂无内容预览，打开查看素材": "Chưa có bản xem trước nội dung. Mở để xem.",
    "视频画布": "Khung vẽ video",
    "素材类别：表格": "Bảng tính",
    "素材类别：游戏": "Trò chơi",
  },
  tr: {
    "显示上次成功加载的作品；列表暂未刷新。": "Son yüklenen öğeler gösteriliyor; liste henüz yenilenmedi.",
    "暂无内容预览，打开查看素材": "İçerik önizlemesi yok. Görmek için açın.",
    "视频画布": "Video tuvali",
    "素材类别：表格": "Elektronik tablo",
    "素材类别：游戏": "Oyun",
  },
  "zh-TW": {
    "显示上次成功加载的作品；列表暂未刷新。": "顯示上次成功載入的作品；列表暫未更新。",
    "暂无内容预览，打开查看素材": "暫無內容預覽，開啟即可檢視素材",
    "视频画布": "影片畫布",
    "素材类别：表格": "試算表",
    "素材类别：游戏": "遊戲",
  },
  ja: {
    "显示上次成功加载的作品；列表暂未刷新。": "前回読み込んだ作品を表示しています。一覧はまだ更新されていません。",
    "暂无内容预览，打开查看素材": "内容のプレビューはありません。開いて確認してください。",
    "视频画布": "動画キャンバス",
    "素材类别：表格": "スプレッドシート",
    "素材类别：游戏": "ゲーム",
  },
  ko: {
    "显示上次成功加载的作品；列表暂未刷新。": "마지막으로 불러온 작품을 표시합니다. 목록은 아직 새로 고쳐지지 않았습니다.",
    "暂无内容预览，打开查看素材": "내용 미리보기가 없습니다. 열어서 확인하세요.",
    "视频画布": "영상 캔버스",
    "素材类别：表格": "스프레드시트",
    "素材类别：游戏": "게임",
  },
  ar: {
    "显示上次成功加载的作品；列表暂未刷新。": "يتم عرض آخر العناصر التي تم تحميلها؛ لم يتم تحديث القائمة بعد.",
    "暂无内容预览，打开查看素材": "لا توجد معاينة للمحتوى. افتح العنصر لعرضه.",
    "视频画布": "لوحة الفيديو",
    "素材类别：表格": "جدول بيانات",
    "素材类别：游戏": "لعبة",
  },
  th: {
    "显示上次成功加载的作品；列表暂未刷新。": "กำลังแสดงรายการที่โหลดล่าสุด รายการยังไม่ได้รีเฟรช",
    "暂无内容预览，打开查看素材": "ยังไม่มีตัวอย่างเนื้อหา เปิดเพื่อดู",
    "视频画布": "ผืนผ้าใบวิดีโอ",
    "素材类别：表格": "สเปรดชีต",
    "素材类别：游戏": "เกม",
  },
  hi: {
    "显示上次成功加载的作品；列表暂未刷新。": "पिछली बार लोड की गई रचनाएँ दिख रही हैं; सूची अभी रीफ़्रेश नहीं हुई है।",
    "暂无内容预览，打开查看素材": "सामग्री का पूर्वावलोकन उपलब्ध नहीं है। देखने के लिए खोलें।",
    "视频画布": "वीडियो कैनवास",
    "素材类别：表格": "स्प्रेडशीट",
    "素材类别：游戏": "गेम",
  },
};
