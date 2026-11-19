import type { Locale } from "../../config";

const keys = [
  "{currency} {price} / 服务器小时（{memory} MiB）",
  "上一个文件",
  "下载数据库",
  "下载请求已交给浏览器。",
  "介绍",
  "任务状态：{state}",
  "作品自己的地址",
  "作品还没有可发布的版本。",
  "你可以修改名称、步骤和网站笔记，也可以删除。新运行从第一步开始；确认操作后，可以从服务器保存的位置继续。",
  "你没有权限管理这个浏览器的登录或授权。",
  "例如：每周下载报表",
  "保存流程",
  "保存选择不会授予服务权限、建立连接或发布作品。",
  "先在上方选择正在运行的浏览器，再运行流程。",
  "创建副本",
  "刷新文件",
  "功能",
  "取消发布后作品地址将无法访问，发布记录会被清除。",
  "只能预览；修改请先创建自己的副本。",
  "可用连接器（{count}）",
  "固定环境：{environment}",
  "在新任务中引用",
  "如果显示浏览器记录，请选择此会话后打开。",
  "容量已用满",
  "将从服务器记录的位置继续执行。",
  "尚无配置变更任务",
  "已保存到我的库。",
  "已停在第 {number} 步；确认后请检查当前页面。",
  "已开始下载源码文件。",
  "并行浏览器",
  "应用看板清单",
  "当前服务器画面",
  "执行浏览器：{name}",
  "按键",
  "提供方式",
  "收起文件",
  "教一次，以后重复执行",
  "数据库下载仅含 public 应用数据与结构，不含服务商的认证、存储、系统数据、角色或平台设置。",
  "文件列表没有读取成功，请刷新文件后重试。",
  "新建流程",
  "无法打开此作品的 agent 对话，请重试。",
  "暂无作品看板",
  "暂时无法读取作品，请重试。",
  "有可用容量",
  "服务器没有完成这个操作，请稍后重试。",
  "未声明额外限制",
  "本次教学已放弃。",
  "查看源码",
  "正在准备数据库文件…",
  "正在处理敏感输入",
  "正在等待对方授权…",
  "正在读取流程和网站笔记…",
  "此作品还没有成本记录。",
  "此步骤的网站范围",
  "步骤 {number} 网页地址",
  "流程及其网站笔记已删除。",
  "流程和网站笔记没有刷新成功。已显示的内容可能不是最新版本，请刷新后再试。",
  "流程已完成",
  "流程执行失败，尚未完成",
  "浏览器、文件或流程状态已改变，请刷新后重试。",
  "清除网站笔记",
  "登录状态已失效，请重新登录。",
  "移除步骤",
  "继续流程",
  "网站笔记",
  "网站范围只能填写网站来源，例如 https://example.com，不包含路径。",
  "观看浏览器",
  "该看板尚未接入，可让 agent 提供看板数据。",
  "请填写有效的 HTTPS 链接",
  "费用依据",
  "还没有保存的流程。完成一次教学后，它会出现在这里。",
  "这个任务",
  "这个浏览器还没有下载文件。",
  "这项请求已变化，请刷新后查看当前状态。",
  "连接服务器画面",
  "连接环境",
  "选择浏览器任务",
  "配置存储尚未就绪，当前显示默认选择，暂时无法保存。",
  "重置裁剪",
  "隐私输入中：画面采集与录制已暂停。密码和付款信息只由你亲自输入，Agent 无法查看。",
  "预览仅用于查看，修改请交给 agent。",
  "预览来源",
  "预览环境"
] as const;

// Each row follows the source-key order. Regional variants share neutral wording.
const en = `
{currency} {price} / server hour ({memory} MiB)
Previous file
Download database
The download request has been sent to your browser.
Introduction
Task status: {state}
This work's own address
This work has no version ready to publish.
You can edit the name, steps, and website notes, or delete the workflow. New runs start at the first step; after confirming, you can resume from the position saved on the server.
You do not have permission to manage sign-in or authorization for this browser.
For example: Download reports weekly
Save workflow
Saving your selection does not grant service permissions, establish connections, or publish your work.
Select a running browser above before running the workflow.
Create a copy
Refresh files
Features
Unpublishing makes the work's address inaccessible and clears its publication history.
Preview only. Create your own copy before editing.
Available connectors ({count})
Fixed environment: {environment}
Reference in a new task
If browser history appears, select this session before opening it.
Capacity full
Execution will resume from the position recorded on the server.
No configuration change tasks yet
Saved to My Library.
Paused at step {number}. Check the current page after confirming.
Source file download started.
Parallel browsers
App dashboard list
Current server screen
Execution browser: {name}
Key
Delivery method
Collapse files
Teach once, repeat later
The database download includes only public application data and schema. It excludes the provider's authentication, storage, system data, roles, and platform settings.
Could not load the file list. Refresh the files and try again.
New workflow
Could not open this work's agent conversation. Try again.
No work dashboards yet
Cannot read this work right now. Try again.
Capacity available
The server did not complete this operation. Try again later.
No additional restrictions declared
This teaching session was discarded.
View source
Preparing the database file…
Processing sensitive input
Waiting for the other party's authorization…
Reading workflows and website notes…
This work has no cost records yet.
Website scope for this step
Step {number} web address
The workflow and its website notes were deleted.
Could not refresh workflows and website notes. The displayed content may be out of date. Refresh and try again.
Workflow completed
Workflow execution failed and is incomplete
The browser, file, or workflow state has changed. Refresh and try again.
Clear website notes
Your sign-in has expired. Sign in again.
Remove step
Resume workflow
Website notes
The website scope must be an origin, such as https://example.com, without a path.
Watch browser
This dashboard is not connected yet. Ask the agent to provide dashboard data.
Enter a valid HTTPS link
Cost basis
No saved workflows yet. Complete a teaching session to see one here.
This task
This browser has no downloaded files yet.
This request has changed. Refresh to see its current status.
Connect to server screen
Connection environment
Select browser task
Configuration storage is not ready. Default selections are shown and cannot be saved yet.
Reset crop
Private input: screen capture and recording are paused. Only you enter passwords and payment details; the Agent cannot see them.
Preview is for viewing only. Ask the agent to make changes.
Preview source
Preview environment
`.trim().split("\n");
const de = `
{currency} {price} / Serverstunde ({memory} MiB)
Vorherige Datei
Datenbank herunterladen
Die Downloadanfrage wurde an Ihren Browser übergeben.
Einführung
Aufgabenstatus: {state}
Eigene Adresse des Werks
Für dieses Werk ist noch keine veröffentlichbare Version vorhanden.
Sie können Namen, Schritte und Website-Notizen bearbeiten oder den Ablauf löschen. Neue Ausführungen beginnen beim ersten Schritt. Nach Bestätigung können Sie an der auf dem Server gespeicherten Stelle fortfahren.
Sie dürfen die Anmeldung oder Autorisierung dieses Browsers nicht verwalten.
Zum Beispiel: Berichte wöchentlich herunterladen
Ablauf speichern
Das Speichern der Auswahl erteilt keine Dienstberechtigungen, stellt keine Verbindungen her und veröffentlicht kein Werk.
Wählen Sie oben einen laufenden Browser aus, bevor Sie den Ablauf ausführen.
Kopie erstellen
Dateien aktualisieren
Funktionen
Wenn Sie die Veröffentlichung aufheben, ist die Adresse des Werks nicht mehr erreichbar und der Veröffentlichungsverlauf wird gelöscht.
Nur Vorschau. Erstellen Sie zum Bearbeiten zuerst eine eigene Kopie.
Verfügbare Konnektoren ({count})
Feste Umgebung: {environment}
In einer neuen Aufgabe referenzieren
Falls der Browserverlauf angezeigt wird, wählen Sie vor dem Öffnen diese Sitzung aus.
Kapazität ausgeschöpft
Die Ausführung wird an der auf dem Server gespeicherten Stelle fortgesetzt.
Noch keine Aufgaben zur Konfigurationsänderung
In meiner Bibliothek gespeichert.
Bei Schritt {number} angehalten. Prüfen Sie nach der Bestätigung die aktuelle Seite.
Download der Quelldateien gestartet.
Parallele Browser
Liste der App-Dashboards
Aktueller Serverbildschirm
Ausführender Browser: {name}
Taste
Bereitstellungsart
Dateien einklappen
Einmal vormachen, später wiederholen
Der Datenbankdownload enthält nur Anwendungsdaten und Strukturen im Schema public. Authentifizierung, Speicher, Systemdaten, Rollen und Plattformeinstellungen des Anbieters sind nicht enthalten.
Die Dateiliste konnte nicht geladen werden. Aktualisieren Sie die Dateien und versuchen Sie es erneut.
Neuer Ablauf
Die Agent-Unterhaltung dieses Werks konnte nicht geöffnet werden. Versuchen Sie es erneut.
Noch keine Werk-Dashboards
Dieses Werk kann gerade nicht gelesen werden. Versuchen Sie es erneut.
Kapazität verfügbar
Der Server hat diesen Vorgang nicht abgeschlossen. Versuchen Sie es später erneut.
Keine zusätzlichen Einschränkungen angegeben
Diese Anleitungssitzung wurde verworfen.
Quellcode ansehen
Datenbankdatei wird vorbereitet…
Vertrauliche Eingabe wird verarbeitet
Warten auf die Autorisierung der anderen Seite…
Abläufe und Website-Notizen werden gelesen…
Für dieses Werk gibt es noch keine Kostenaufzeichnungen.
Website-Bereich dieses Schritts
Webadresse von Schritt {number}
Der Ablauf und seine Website-Notizen wurden gelöscht.
Abläufe und Website-Notizen konnten nicht aktualisiert werden. Die angezeigten Inhalte sind möglicherweise veraltet. Aktualisieren Sie sie und versuchen Sie es erneut.
Ablauf abgeschlossen
Ausführung fehlgeschlagen, Ablauf nicht abgeschlossen
Der Browser-, Datei- oder Ablaufstatus hat sich geändert. Aktualisieren Sie die Ansicht und versuchen Sie es erneut.
Website-Notizen löschen
Ihre Anmeldung ist abgelaufen. Melden Sie sich erneut an.
Schritt entfernen
Ablauf fortsetzen
Website-Notizen
Der Website-Bereich muss eine Herkunft wie https://example.com ohne Pfad sein.
Browser beobachten
Dieses Dashboard ist noch nicht angebunden. Bitten Sie den Agenten, Dashboard-Daten bereitzustellen.
Geben Sie einen gültigen HTTPS-Link ein
Kostengrundlage
Noch keine gespeicherten Abläufe. Nach einer Anleitungssitzung erscheint hier ein Ablauf.
Diese Aufgabe
Dieser Browser hat noch keine Dateien heruntergeladen.
Diese Anfrage hat sich geändert. Aktualisieren Sie die Ansicht, um den aktuellen Status zu sehen.
Mit dem Serverbildschirm verbinden
Verbindungsumgebung
Browseraufgabe auswählen
Der Konfigurationsspeicher ist noch nicht bereit. Die Standardauswahl wird angezeigt und kann noch nicht gespeichert werden.
Zuschnitt zurücksetzen
Private Eingabe: Bildschirmaufnahme und Aufzeichnung sind pausiert. Passwörter und Zahlungsdaten geben nur Sie selbst ein; der Agent kann sie nicht sehen.
Die Vorschau dient nur zur Ansicht. Bitten Sie den Agenten um Änderungen.
Vorschauquelle
Vorschauumgebung
`.trim().split("\n");
const es = `
{currency} {price} / hora de servidor ({memory} MiB)
Archivo anterior
Descargar base de datos
La solicitud de descarga se ha enviado al navegador.
Introducción
Estado de la tarea: {state}
Dirección propia de la obra
Esta obra aún no tiene una versión lista para publicar.
Puedes editar el nombre, los pasos y las notas del sitio web, o eliminar el flujo. Las nuevas ejecuciones empiezan en el primer paso; tras confirmar, puedes continuar desde la posición guardada en el servidor.
No tienes permiso para gestionar el inicio de sesión ni la autorización de este navegador.
Por ejemplo: Descargar informes semanalmente
Guardar flujo
Guardar la selección no concede permisos de servicio, establece conexiones ni publica la obra.
Selecciona arriba un navegador en ejecución antes de ejecutar el flujo.
Crear una copia
Actualizar archivos
Funciones
Al retirar la publicación, la dirección de la obra dejará de ser accesible y se borrará el historial de publicación.
Solo vista previa. Crea tu propia copia antes de editar.
Conectores disponibles ({count})
Entorno fijo: {environment}
Referenciar en una nueva tarea
Si aparece el historial del navegador, selecciona esta sesión antes de abrirlo.
Capacidad completa
La ejecución continuará desde la posición registrada en el servidor.
Aún no hay tareas de cambio de configuración
Guardado en Mi biblioteca.
Detenido en el paso {number}. Comprueba la página actual tras confirmar.
Se ha iniciado la descarga de los archivos fuente.
Navegadores en paralelo
Lista de paneles de aplicaciones
Pantalla actual del servidor
Navegador de ejecución: {name}
Tecla
Método de entrega
Contraer archivos
Enseña una vez y repite después
La descarga de la base de datos solo incluye datos y estructura de la aplicación en public. No incluye autenticación, almacenamiento, datos del sistema, roles ni ajustes de plataforma del proveedor.
No se pudo cargar la lista de archivos. Actualiza los archivos y vuelve a intentarlo.
Nuevo flujo
No se pudo abrir la conversación con el agente de esta obra. Vuelve a intentarlo.
Aún no hay paneles de obras
No se puede leer esta obra en este momento. Vuelve a intentarlo.
Capacidad disponible
El servidor no completó esta operación. Vuelve a intentarlo más tarde.
No se han declarado restricciones adicionales
Se ha descartado esta sesión de enseñanza.
Ver código fuente
Preparando el archivo de base de datos…
Procesando datos confidenciales
Esperando la autorización de la otra parte…
Leyendo flujos y notas del sitio web…
Esta obra aún no tiene registros de costos.
Ámbito del sitio web para este paso
Dirección web del paso {number}
Se han eliminado el flujo y sus notas del sitio web.
No se pudieron actualizar los flujos y las notas del sitio web. El contenido mostrado puede estar desactualizado. Actualiza y vuelve a intentarlo.
Flujo completado
La ejecución del flujo falló y no se completó
El estado del navegador, archivo o flujo ha cambiado. Actualiza y vuelve a intentarlo.
Borrar notas del sitio web
Tu sesión ha caducado. Vuelve a iniciar sesión.
Quitar paso
Continuar flujo
Notas del sitio web
El ámbito del sitio web debe ser un origen, como https://example.com, sin ruta.
Observar navegador
Este panel aún no está conectado. Pide al agente que proporcione datos para el panel.
Introduce un enlace HTTPS válido
Base del costo
Aún no hay flujos guardados. Completa una sesión de enseñanza para que aparezcan aquí.
Esta tarea
Este navegador aún no tiene archivos descargados.
Esta solicitud ha cambiado. Actualiza para ver su estado actual.
Conectar con la pantalla del servidor
Entorno de conexión
Seleccionar tarea del navegador
El almacenamiento de configuración aún no está listo. Se muestran las selecciones predeterminadas y todavía no se pueden guardar.
Restablecer recorte
Entrada privada: la captura y grabación de pantalla están pausadas. Solo tú introduces contraseñas y datos de pago; el Agent no puede verlos.
La vista previa es solo de consulta. Pide al agente que haga los cambios.
Origen de la vista previa
Entorno de vista previa
`.trim().split("\n");
const fr = `
{currency} {price} / heure serveur ({memory} MiB)
Fichier précédent
Télécharger la base de données
La demande de téléchargement a été transmise au navigateur.
Présentation
État de la tâche : {state}
Adresse propre à cette création
Cette création n’a pas encore de version prête à publier.
Vous pouvez modifier le nom, les étapes et les notes de site, ou supprimer le processus. Les nouvelles exécutions commencent à la première étape ; après confirmation, vous pouvez reprendre à la position enregistrée sur le serveur.
Vous n’avez pas l’autorisation de gérer la connexion ou les autorisations de ce navigateur.
Par exemple : Télécharger les rapports chaque semaine
Enregistrer le processus
Enregistrer la sélection n’accorde aucun droit sur les services, n’établit aucune connexion et ne publie pas la création.
Sélectionnez un navigateur en cours d’exécution ci-dessus avant de lancer le processus.
Créer une copie
Actualiser les fichiers
Fonctionnalités
Retirer la publication rend l’adresse de la création inaccessible et efface l’historique de publication.
Aperçu uniquement. Créez votre propre copie avant de modifier.
Connecteurs disponibles ({count})
Environnement fixe : {environment}
Référencer dans une nouvelle tâche
Si l’historique du navigateur apparaît, sélectionnez cette session avant de l’ouvrir.
Capacité épuisée
L’exécution reprendra à la position enregistrée sur le serveur.
Aucune tâche de modification de configuration pour le moment
Enregistré dans Ma bibliothèque.
Arrêt à l’étape {number}. Vérifiez la page actuelle après confirmation.
Le téléchargement des fichiers sources a commencé.
Navigateurs parallèles
Liste des tableaux de bord d’applications
Écran actuel du serveur
Navigateur d’exécution : {name}
Touche
Mode de mise à disposition
Réduire les fichiers
Montrez une fois, répétez ensuite
Le téléchargement de la base de données contient uniquement les données et la structure de l’application dans public. Il exclut l’authentification, le stockage, les données système, les rôles et les paramètres de plateforme du fournisseur.
Impossible de charger la liste des fichiers. Actualisez les fichiers et réessayez.
Nouveau processus
Impossible d’ouvrir la conversation avec l’agent de cette création. Réessayez.
Aucun tableau de bord de création pour le moment
Impossible de lire cette création pour le moment. Réessayez.
Capacité disponible
Le serveur n’a pas terminé cette opération. Réessayez plus tard.
Aucune restriction supplémentaire déclarée
Cette session d’apprentissage a été abandonnée.
Voir le code source
Préparation du fichier de base de données…
Traitement d’une saisie sensible
En attente de l’autorisation de l’autre partie…
Lecture des processus et des notes de site…
Cette création n’a pas encore de relevé de coûts.
Périmètre du site pour cette étape
Adresse web de l’étape {number}
Le processus et ses notes de site ont été supprimés.
Impossible d’actualiser les processus et les notes de site. Le contenu affiché peut être obsolète. Actualisez et réessayez.
Processus terminé
L’exécution du processus a échoué et reste incomplète
L’état du navigateur, du fichier ou du processus a changé. Actualisez et réessayez.
Effacer les notes de site
Votre connexion a expiré. Reconnectez-vous.
Supprimer l’étape
Reprendre le processus
Notes de site
Le périmètre du site doit être une origine, comme https://example.com, sans chemin.
Observer le navigateur
Ce tableau de bord n’est pas encore connecté. Demandez à l’agent de fournir ses données.
Saisissez un lien HTTPS valide
Base de calcul des coûts
Aucun processus enregistré. Terminez une session d’apprentissage pour en voir un ici.
Cette tâche
Ce navigateur n’a pas encore téléchargé de fichiers.
Cette demande a changé. Actualisez pour voir son état actuel.
Se connecter à l’écran du serveur
Environnement de connexion
Sélectionner une tâche de navigateur
Le stockage de configuration n’est pas encore prêt. Les choix par défaut sont affichés et ne peuvent pas encore être enregistrés.
Réinitialiser le recadrage
Saisie privée : la capture et l’enregistrement d’écran sont suspendus. Vous seul saisissez les mots de passe et les informations de paiement ; l’Agent ne peut pas les voir.
L’aperçu sert uniquement à consulter. Demandez les modifications à l’agent.
Source de l’aperçu
Environnement de l’aperçu
`.trim().split("\n");
const it = `
{currency} {price} / ora server ({memory} MiB)
File precedente
Scarica database
La richiesta di download è stata inviata al browser.
Introduzione
Stato attività: {state}
Indirizzo proprio dell’opera
Questa opera non ha ancora una versione pronta da pubblicare.
Puoi modificare nome, passaggi e note del sito, oppure eliminare il flusso. Le nuove esecuzioni iniziano dal primo passaggio; dopo la conferma puoi riprendere dalla posizione salvata sul server.
Non hai il permesso di gestire l’accesso o l’autorizzazione di questo browser.
Ad esempio: Scarica i report ogni settimana
Salva flusso
Salvare la selezione non concede permessi sui servizi, non crea connessioni e non pubblica l’opera.
Seleziona un browser in esecuzione qui sopra prima di avviare il flusso.
Crea una copia
Aggiorna file
Funzionalità
Annullando la pubblicazione, l’indirizzo dell’opera non sarà più accessibile e la cronologia delle pubblicazioni verrà cancellata.
Solo anteprima. Crea prima una tua copia per modificare.
Connettori disponibili ({count})
Ambiente fisso: {environment}
Fai riferimento in una nuova attività
Se appare la cronologia del browser, seleziona questa sessione prima di aprirla.
Capacità esaurita
L’esecuzione riprenderà dalla posizione registrata sul server.
Nessuna attività di modifica della configurazione
Salvato nella mia libreria.
Fermato al passaggio {number}. Controlla la pagina attuale dopo la conferma.
Download dei file sorgente avviato.
Browser paralleli
Elenco delle dashboard delle applicazioni
Schermata attuale del server
Browser di esecuzione: {name}
Tasto
Modalità di fornitura
Comprimi file
Insegna una volta, ripeti in seguito
Il download del database include solo dati e struttura dell’applicazione in public. Non include autenticazione, archiviazione, dati di sistema, ruoli o impostazioni della piattaforma del fornitore.
Impossibile caricare l’elenco dei file. Aggiorna i file e riprova.
Nuovo flusso
Impossibile aprire la conversazione con l’agente di questa opera. Riprova.
Nessuna dashboard di opere
Al momento non è possibile leggere questa opera. Riprova.
Capacità disponibile
Il server non ha completato questa operazione. Riprova più tardi.
Nessuna restrizione aggiuntiva dichiarata
Questa sessione di insegnamento è stata scartata.
Visualizza sorgente
Preparazione del file del database…
Elaborazione di dati sensibili
In attesa dell’autorizzazione dell’altra parte…
Lettura di flussi e note del sito…
Questa opera non ha ancora registrazioni dei costi.
Ambito del sito per questo passaggio
Indirizzo web del passaggio {number}
Il flusso e le relative note del sito sono stati eliminati.
Impossibile aggiornare flussi e note del sito. I contenuti mostrati potrebbero non essere aggiornati. Aggiorna e riprova.
Flusso completato
Esecuzione del flusso non riuscita e non completata
Lo stato del browser, del file o del flusso è cambiato. Aggiorna e riprova.
Cancella note del sito
L’accesso è scaduto. Accedi di nuovo.
Rimuovi passaggio
Riprendi flusso
Note del sito
L’ambito del sito deve essere un’origine, come https://example.com, senza percorso.
Osserva browser
Questa dashboard non è ancora collegata. Chiedi all’agente di fornire i dati della dashboard.
Inserisci un link HTTPS valido
Base di calcolo dei costi
Nessun flusso salvato. Completa una sessione di insegnamento per vederlo qui.
Questa attività
Questo browser non ha ancora scaricato file.
Questa richiesta è cambiata. Aggiorna per visualizzare lo stato attuale.
Collega alla schermata del server
Ambiente di connessione
Seleziona attività del browser
L’archiviazione della configurazione non è ancora pronta. Vengono mostrate le selezioni predefinite e non è ancora possibile salvarle.
Reimposta ritaglio
Inserimento privato: acquisizione e registrazione dello schermo sono sospese. Solo tu inserisci password e dati di pagamento; l’Agent non può vederli.
L’anteprima è solo per la visualizzazione. Chiedi all’agente di apportare modifiche.
Origine dell’anteprima
Ambiente dell’anteprima
`.trim().split("\n");
const pt = `
{currency} {price} / hora de servidor ({memory} MiB)
Ficheiro anterior
Descarregar base de dados
O pedido de transferência foi enviado ao navegador.
Introdução
Estado da tarefa: {state}
Endereço próprio da obra
Esta obra ainda não tem uma versão pronta para publicar.
Pode editar o nome, os passos e as notas do site, ou eliminar o fluxo. As novas execuções começam no primeiro passo; após confirmar, pode continuar a partir da posição guardada no servidor.
Não tem permissão para gerir o início de sessão ou a autorização deste navegador.
Por exemplo: Descarregar relatórios semanalmente
Guardar fluxo
Guardar a seleção não concede permissões de serviço, estabelece ligações nem publica a obra.
Selecione acima um navegador em execução antes de executar o fluxo.
Criar uma cópia
Atualizar ficheiros
Funcionalidades
Ao remover a publicação, o endereço da obra ficará inacessível e o histórico de publicação será apagado.
Apenas pré-visualização. Crie primeiro a sua própria cópia para editar.
Conectores disponíveis ({count})
Ambiente fixo: {environment}
Referenciar numa nova tarefa
Se aparecer o histórico do navegador, selecione esta sessão antes de o abrir.
Capacidade esgotada
A execução continuará a partir da posição registada no servidor.
Ainda não há tarefas de alteração da configuração
Guardado na minha biblioteca.
Parado no passo {number}. Verifique a página atual após confirmar.
A transferência dos ficheiros de código-fonte começou.
Navegadores paralelos
Lista de painéis de aplicações
Ecrã atual do servidor
Navegador de execução: {name}
Tecla
Forma de disponibilização
Recolher ficheiros
Ensine uma vez, repita depois
A transferência da base de dados inclui apenas os dados e a estrutura da aplicação em public. Não inclui autenticação, armazenamento, dados do sistema, funções ou definições da plataforma do fornecedor.
Não foi possível carregar a lista de ficheiros. Atualize os ficheiros e tente novamente.
Novo fluxo
Não foi possível abrir a conversa com o agente desta obra. Tente novamente.
Ainda não há painéis de obras
Não é possível ler esta obra neste momento. Tente novamente.
Capacidade disponível
O servidor não concluiu esta operação. Tente novamente mais tarde.
Sem restrições adicionais declaradas
Esta sessão de ensino foi descartada.
Ver código-fonte
A preparar o ficheiro da base de dados…
A processar dados sensíveis
A aguardar autorização da outra parte…
A ler fluxos e notas do site…
Esta obra ainda não tem registos de custos.
Âmbito do site deste passo
Endereço web do passo {number}
O fluxo e as suas notas do site foram eliminados.
Não foi possível atualizar os fluxos e as notas do site. O conteúdo apresentado pode estar desatualizado. Atualize e tente novamente.
Fluxo concluído
A execução do fluxo falhou e não foi concluída
O estado do navegador, ficheiro ou fluxo mudou. Atualize e tente novamente.
Limpar notas do site
A sessão expirou. Inicie sessão novamente.
Remover passo
Continuar fluxo
Notas do site
O âmbito do site deve ser uma origem, como https://example.com, sem caminho.
Observar navegador
Este painel ainda não está ligado. Peça ao agente que forneça os dados do painel.
Introduza uma ligação HTTPS válida
Base de cálculo dos custos
Ainda não há fluxos guardados. Conclua uma sessão de ensino para que apareçam aqui.
Esta tarefa
Este navegador ainda não tem ficheiros transferidos.
Este pedido mudou. Atualize para ver o estado atual.
Ligar ao ecrã do servidor
Ambiente de ligação
Selecionar tarefa do navegador
O armazenamento da configuração ainda não está pronto. São apresentadas as seleções predefinidas e ainda não é possível guardar.
Repor recorte
Entrada privada: a captura e gravação do ecrã estão em pausa. Só o utilizador introduz palavras-passe e dados de pagamento; o Agent não os pode ver.
A pré-visualização serve apenas para consulta. Peça ao agente para fazer alterações.
Origem da pré-visualização
Ambiente de pré-visualização
`.trim().split("\n");
// Brazilian terminology follows the same meaning with local UI vocabulary.
const ptBR = pt.map((value) => value
  .replaceAll("Ficheiro", "Arquivo").replaceAll("ficheiros", "arquivos").replaceAll("ficheiro", "arquivo")
  .replaceAll("Descarregar", "Baixar").replaceAll("descarregar", "baixar")
  .replaceAll("transferência", "download").replaceAll("transferidos", "baixados")
  .replaceAll("Guardar", "Salvar").replaceAll("Guardado", "Salvo").replaceAll("guardada", "salva").replaceAll("guardados", "salvos").replaceAll("guardar", "salvar")
  .replaceAll("Ecrã", "Tela").replaceAll("ecrã", "tela")
  .replaceAll("registada", "registrada").replaceAll("registos", "registros")
  .replaceAll("definições", "configurações").replaceAll("predefinidas", "padrão")
  .replaceAll("palavras-passe", "senhas").replaceAll("utilizador", "usuário")
  .replaceAll("gerir", "gerenciar").replaceAll("numa", "em uma")
  .replaceAll("ligação", "conexão").replaceAll("ligações", "conexões")
  .replaceAll("Repor recorte", "Redefinir recorte")
  .replaceAll("A preparar", "Preparando").replaceAll("A processar", "Processando").replaceAll("A aguardar", "Aguardando").replaceAll("A ler", "Lendo")
  .replaceAll("Introduza", "Insira").replaceAll("Inicie sessão", "Faça login")
  .replaceAll("Não tem permissão", "Você não tem permissão")
);
const vi = `
{currency} {price} / giờ máy chủ ({memory} MiB)
Tệp trước
Tải cơ sở dữ liệu
Yêu cầu tải xuống đã được chuyển cho trình duyệt.
Giới thiệu
Trạng thái tác vụ: {state}
Địa chỉ riêng của tác phẩm
Tác phẩm này chưa có phiên bản sẵn sàng xuất bản.
Bạn có thể sửa tên, các bước và ghi chú trang web, hoặc xóa quy trình. Lần chạy mới bắt đầu từ bước đầu tiên; sau khi xác nhận, bạn có thể tiếp tục từ vị trí đã lưu trên máy chủ.
Bạn không có quyền quản lý đăng nhập hoặc ủy quyền của trình duyệt này.
Ví dụ: Tải báo cáo hằng tuần
Lưu quy trình
Lưu lựa chọn không cấp quyền dịch vụ, thiết lập kết nối hay xuất bản tác phẩm.
Hãy chọn trình duyệt đang chạy ở trên trước khi chạy quy trình.
Tạo bản sao
Làm mới tệp
Tính năng
Hủy xuất bản sẽ khiến địa chỉ tác phẩm không thể truy cập và xóa lịch sử xuất bản.
Chỉ xem trước. Hãy tạo bản sao của riêng bạn trước khi chỉnh sửa.
Trình kết nối khả dụng ({count})
Môi trường cố định: {environment}
Tham chiếu trong tác vụ mới
Nếu lịch sử trình duyệt xuất hiện, hãy chọn phiên này trước khi mở.
Đã hết dung lượng
Quy trình sẽ tiếp tục từ vị trí được ghi lại trên máy chủ.
Chưa có tác vụ thay đổi cấu hình
Đã lưu vào thư viện của tôi.
Đã dừng ở bước {number}. Hãy kiểm tra trang hiện tại sau khi xác nhận.
Đã bắt đầu tải tệp mã nguồn.
Trình duyệt song song
Danh sách bảng điều khiển ứng dụng
Màn hình máy chủ hiện tại
Trình duyệt thực thi: {name}
Phím
Hình thức cung cấp
Thu gọn tệp
Hướng dẫn một lần, lặp lại về sau
Bản tải cơ sở dữ liệu chỉ gồm dữ liệu ứng dụng và cấu trúc trong public, không gồm xác thực, lưu trữ, dữ liệu hệ thống, vai trò hay cài đặt nền tảng của nhà cung cấp.
Không thể tải danh sách tệp. Hãy làm mới tệp rồi thử lại.
Quy trình mới
Không thể mở cuộc trò chuyện với agent của tác phẩm này. Hãy thử lại.
Chưa có bảng điều khiển tác phẩm
Hiện không thể đọc tác phẩm. Hãy thử lại.
Còn dung lượng
Máy chủ chưa hoàn tất thao tác này. Hãy thử lại sau.
Không khai báo hạn chế bổ sung
Đã hủy buổi hướng dẫn này.
Xem mã nguồn
Đang chuẩn bị tệp cơ sở dữ liệu…
Đang xử lý dữ liệu nhạy cảm
Đang chờ bên kia ủy quyền…
Đang đọc quy trình và ghi chú trang web…
Tác phẩm này chưa có bản ghi chi phí.
Phạm vi trang web của bước này
Địa chỉ web của bước {number}
Đã xóa quy trình và ghi chú trang web của quy trình.
Không thể làm mới quy trình và ghi chú trang web. Nội dung đang hiển thị có thể đã cũ. Hãy làm mới rồi thử lại.
Đã hoàn tất quy trình
Thực thi quy trình thất bại và chưa hoàn tất
Trạng thái trình duyệt, tệp hoặc quy trình đã thay đổi. Hãy làm mới rồi thử lại.
Xóa ghi chú trang web
Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.
Xóa bước
Tiếp tục quy trình
Ghi chú trang web
Phạm vi trang web phải là nguồn gốc như https://example.com, không có đường dẫn.
Theo dõi trình duyệt
Bảng điều khiển này chưa được kết nối. Hãy yêu cầu agent cung cấp dữ liệu bảng điều khiển.
Nhập liên kết HTTPS hợp lệ
Cơ sở tính phí
Chưa có quy trình đã lưu. Hoàn thành một buổi hướng dẫn để quy trình xuất hiện ở đây.
Tác vụ này
Trình duyệt này chưa tải tệp nào.
Yêu cầu này đã thay đổi. Hãy làm mới để xem trạng thái hiện tại.
Kết nối màn hình máy chủ
Môi trường kết nối
Chọn tác vụ trình duyệt
Bộ lưu trữ cấu hình chưa sẵn sàng. Đang hiển thị lựa chọn mặc định và tạm thời không thể lưu.
Đặt lại vùng cắt
Đang nhập riêng tư: chụp và ghi màn hình đã tạm dừng. Chỉ bạn tự nhập mật khẩu và thông tin thanh toán; Agent không thể xem.
Bản xem trước chỉ dùng để xem. Hãy yêu cầu agent chỉnh sửa.
Nguồn xem trước
Môi trường xem trước
`.trim().split("\n");
const tr = `
{currency} {price} / sunucu saati ({memory} MiB)
Önceki dosya
Veritabanını indir
İndirme isteği tarayıcınıza iletildi.
Tanıtım
Görev durumu: {state}
Çalışmanın kendi adresi
Bu çalışmanın henüz yayımlanmaya hazır bir sürümü yok.
Adı, adımları ve site notlarını düzenleyebilir veya iş akışını silebilirsiniz. Yeni çalıştırmalar ilk adımdan başlar; onayladıktan sonra sunucuda kaydedilen konumdan devam edebilirsiniz.
Bu tarayıcının oturum açma veya yetkilendirme işlemlerini yönetme izniniz yok.
Örneğin: Raporları her hafta indir
İş akışını kaydet
Seçimi kaydetmek hizmet izni vermez, bağlantı kurmaz veya çalışmayı yayımlamaz.
İş akışını çalıştırmadan önce yukarıdan çalışan bir tarayıcı seçin.
Kopya oluştur
Dosyaları yenile
Özellikler
Yayından kaldırıldığında çalışmanın adresine erişilemez ve yayın geçmişi silinir.
Yalnızca önizleme. Düzenlemek için önce kendi kopyanızı oluşturun.
Kullanılabilir bağlayıcılar ({count})
Sabit ortam: {environment}
Yeni görevde referans ver
Tarayıcı geçmişi görünürse açmadan önce bu oturumu seçin.
Kapasite dolu
Sunucuda kaydedilen konumdan yürütmeye devam edilecek.
Henüz yapılandırma değiştirme görevi yok
Kitaplığıma kaydedildi.
{number}. adımda durdu. Onayladıktan sonra mevcut sayfayı kontrol edin.
Kaynak dosyaların indirilmesi başladı.
Paralel tarayıcılar
Uygulama panoları listesi
Geçerli sunucu ekranı
Yürütme tarayıcısı: {name}
Tuş
Sunum yöntemi
Dosyaları daralt
Bir kez öğretin, sonra tekrarlayın
Veritabanı indirmesi yalnızca public içindeki uygulama verilerini ve yapısını içerir. Sağlayıcının kimlik doğrulama, depolama, sistem verileri, rolleri veya platform ayarları dahil değildir.
Dosya listesi yüklenemedi. Dosyaları yenileyip tekrar deneyin.
Yeni iş akışı
Bu çalışmanın agent konuşması açılamadı. Tekrar deneyin.
Henüz çalışma panosu yok
Çalışma şu anda okunamıyor. Tekrar deneyin.
Kullanılabilir kapasite var
Sunucu bu işlemi tamamlamadı. Daha sonra tekrar deneyin.
Ek kısıtlama belirtilmedi
Bu öğretme oturumu iptal edildi.
Kaynak kodunu görüntüle
Veritabanı dosyası hazırlanıyor…
Hassas giriş işleniyor
Karşı tarafın yetkilendirmesi bekleniyor…
İş akışları ve site notları okunuyor…
Bu çalışma için henüz maliyet kaydı yok.
Bu adımın site kapsamı
{number}. adımın web adresi
İş akışı ve site notları silindi.
İş akışları ve site notları yenilenemedi. Gösterilen içerik güncel olmayabilir. Yenileyip tekrar deneyin.
İş akışı tamamlandı
İş akışı yürütülemedi ve tamamlanmadı
Tarayıcı, dosya veya iş akışı durumu değişti. Yenileyip tekrar deneyin.
Site notlarını temizle
Oturumunuzun süresi doldu. Yeniden oturum açın.
Adımı kaldır
İş akışına devam et
Site notları
Site kapsamı, yol içermeyen https://example.com gibi bir kaynak olmalıdır.
Tarayıcıyı izle
Bu pano henüz bağlanmadı. Agent’tan pano verilerini sağlamasını isteyin.
Geçerli bir HTTPS bağlantısı girin
Maliyet dayanağı
Henüz kaydedilmiş iş akışı yok. Bir öğretme oturumunu tamamladığınızda burada görünür.
Bu görev
Bu tarayıcıda henüz indirilmiş dosya yok.
Bu istek değişti. Geçerli durumu görmek için yenileyin.
Sunucu ekranına bağlan
Bağlantı ortamı
Tarayıcı görevini seç
Yapılandırma depolaması henüz hazır değil. Varsayılan seçimler gösteriliyor ve şu an kaydedilemiyor.
Kırpmayı sıfırla
Özel giriş: ekran yakalama ve kayıt duraklatıldı. Parolaları ve ödeme bilgilerini yalnızca siz girersiniz; Agent bunları göremez.
Önizleme yalnızca görüntüleme içindir. Değişiklikler için agent’a başvurun.
Önizleme kaynağı
Önizleme ortamı
`.trim().split("\n");
const zhTW = `
{currency} {price} / 伺服器小時（{memory} MiB）
上一個檔案
下載資料庫
下載要求已交給瀏覽器。
介紹
任務狀態：{state}
作品自己的網址
作品還沒有可發布的版本。
你可以修改名稱、步驟和網站筆記，也可以刪除。新的執行會從第一步開始；確認操作後，可以從伺服器儲存的位置繼續。
你沒有權限管理這個瀏覽器的登入或授權。
例如：每週下載報表
儲存流程
儲存選擇不會授予服務權限、建立連線或發布作品。
先在上方選擇正在執行的瀏覽器，再執行流程。
建立副本
重新整理檔案
功能
取消發布後，作品網址將無法存取，發布記錄會被清除。
僅能預覽；修改前請先建立自己的副本。
可用連接器（{count}）
固定環境：{environment}
在新任務中引用
如果顯示瀏覽器記錄，請先選擇此工作階段再開啟。
容量已滿
將從伺服器記錄的位置繼續執行。
尚無設定變更任務
已儲存至我的收藏庫。
已停在第 {number} 步；確認後請檢查目前頁面。
已開始下載原始碼檔案。
平行瀏覽器
應用程式看板清單
目前的伺服器畫面
執行瀏覽器：{name}
按鍵
提供方式
收合檔案
教一次，以後重複執行
資料庫下載僅含 public 應用程式資料與結構，不含服務供應商的驗證、儲存、系統資料、角色或平台設定。
無法讀取檔案清單，請重新整理檔案後再試。
新增流程
無法開啟此作品的 agent 對話，請再試一次。
尚無作品看板
暫時無法讀取作品，請再試一次。
尚有可用容量
伺服器未完成這個操作，請稍後再試。
未聲明額外限制
本次教學已放棄。
查看原始碼
正在準備資料庫檔案…
正在處理敏感輸入
正在等待對方授權…
正在讀取流程和網站筆記…
此作品還沒有成本記錄。
此步驟的網站範圍
步驟 {number} 網頁網址
流程及其網站筆記已刪除。
流程和網站筆記未能重新整理。顯示的內容可能不是最新版本，請重新整理後再試。
流程已完成
流程執行失敗，尚未完成
瀏覽器、檔案或流程狀態已改變，請重新整理後再試。
清除網站筆記
登入狀態已失效，請重新登入。
移除步驟
繼續流程
網站筆記
網站範圍只能填寫網站來源，例如 https://example.com，不含路徑。
觀看瀏覽器
此看板尚未接入，可請 agent 提供看板資料。
請填寫有效的 HTTPS 連結
費用依據
還沒有儲存的流程。完成一次教學後，就會顯示在這裡。
這個任務
這個瀏覽器還沒有下載檔案。
這項要求已變更，請重新整理後查看目前狀態。
連接伺服器畫面
連線環境
選擇瀏覽器任務
設定儲存空間尚未就緒，目前顯示預設選擇，暫時無法儲存。
重設裁切
隱私輸入中：畫面擷取與錄影已暫停。密碼和付款資訊僅由你親自輸入，Agent 無法查看。
預覽僅供查看，修改請交給 agent。
預覽來源
預覽環境
`.trim().split("\n");
const ja = `
{currency} {price} / サーバー時間（{memory} MiB）
前のファイル
データベースをダウンロード
ダウンロード要求をブラウザーに渡しました。
紹介
タスクの状態：{state}
作品固有のアドレス
この作品にはまだ公開できるバージョンがありません。
名前、手順、サイトメモの変更や、フローの削除ができます。新たな実行は最初の手順から始まります。確認後、サーバーに保存された位置から再開することもできます。
このブラウザーのログインや認証を管理する権限がありません。
例：毎週レポートをダウンロード
フローを保存
選択を保存しても、サービスの権限付与、接続の確立、作品の公開は行われません。
フローを実行する前に、上で実行中のブラウザーを選んでください。
コピーを作成
ファイルを更新
機能
公開を取り消すと作品のアドレスにアクセスできなくなり、公開履歴が削除されます。
プレビュー専用です。編集するには自分のコピーを作成してください。
利用可能なコネクター（{count}）
固定環境：{environment}
新しいタスクで参照
ブラウザーの履歴が表示された場合は、このセッションを選んでから開いてください。
容量がいっぱいです
サーバーに記録された位置から実行を再開します。
設定変更タスクはまだありません
マイライブラリに保存しました。
手順 {number} で停止しました。確認後に現在のページを確認してください。
ソースファイルのダウンロードを開始しました。
並列ブラウザー
アプリのダッシュボード一覧
現在のサーバー画面
実行ブラウザー：{name}
キー
提供方法
ファイルを折りたたむ
一度教えて、後は繰り返し実行
データベースのダウンロードには public 内のアプリデータと構造のみが含まれます。プロバイダーの認証、ストレージ、システムデータ、ロール、プラットフォーム設定は含まれません。
ファイル一覧を読み込めませんでした。ファイルを更新して再試行してください。
新しいフロー
この作品の agent との会話を開けません。再試行してください。
作品のダッシュボードはまだありません
現在この作品を読み取れません。再試行してください。
空き容量があります
サーバーがこの操作を完了しませんでした。後でもう一度お試しください。
追加の制限は宣言されていません
今回の指導を破棄しました。
ソースコードを表示
データベースファイルを準備中…
機密情報の入力を処理中
相手の承認を待っています…
フローとサイトメモを読み込み中…
この作品の費用記録はまだありません。
この手順のサイト範囲
手順 {number} のウェブアドレス
フローとそのサイトメモを削除しました。
フローとサイトメモを更新できませんでした。表示内容が古い可能性があります。更新して再試行してください。
フローが完了しました
フローの実行に失敗し、未完了です
ブラウザー、ファイル、またはフローの状態が変わりました。更新して再試行してください。
サイトメモを消去
ログインの有効期限が切れました。再度ログインしてください。
手順を削除
フローを再開
サイトメモ
サイト範囲には https://example.com のようなオリジンを、パスを含めずに入力してください。
ブラウザーを見る
このダッシュボードはまだ接続されていません。agent にダッシュボードのデータ提供を依頼できます。
有効な HTTPS リンクを入力してください
費用の算定根拠
保存済みのフローはまだありません。一度指導を完了すると、ここに表示されます。
このタスク
このブラウザーにはまだダウンロードしたファイルがありません。
この要求は変更されました。更新して現在の状態を確認してください。
サーバー画面に接続
接続環境
ブラウザータスクを選択
設定ストレージの準備ができていません。既定の選択を表示しており、まだ保存できません。
切り抜きをリセット
プライベート入力中：画面の取得と録画を一時停止しています。パスワードや支払い情報はご自身で入力し、Agent は見ることができません。
プレビューは閲覧専用です。変更は agent に依頼してください。
プレビューのソース
プレビュー環境
`.trim().split("\n");
const ko = `
{currency} {price} / 서버 시간({memory} MiB)
이전 파일
데이터베이스 다운로드
다운로드 요청을 브라우저에 전달했습니다.
소개
작업 상태: {state}
작품 고유 주소
이 작품에는 아직 게시할 수 있는 버전이 없습니다.
이름, 단계, 웹사이트 메모를 수정하거나 흐름을 삭제할 수 있습니다. 새 실행은 첫 단계부터 시작하며, 확인 후 서버에 저장된 위치에서 계속할 수 있습니다.
이 브라우저의 로그인이나 인증을 관리할 권한이 없습니다.
예: 매주 보고서 다운로드
흐름 저장
선택 항목을 저장해도 서비스 권한을 부여하거나 연결을 설정하거나 작품을 게시하지 않습니다.
흐름을 실행하기 전에 위에서 실행 중인 브라우저를 선택하세요.
사본 만들기
파일 새로고침
기능
게시를 취소하면 작품 주소에 접근할 수 없으며 게시 기록이 삭제됩니다.
미리보기만 가능합니다. 수정하려면 먼저 자신의 사본을 만드세요.
사용 가능한 커넥터({count})
고정 환경: {environment}
새 작업에서 참조
브라우저 기록이 표시되면 이 세션을 선택한 후 여세요.
용량이 가득 찼습니다
서버에 기록된 위치에서 실행을 계속합니다.
아직 설정 변경 작업이 없습니다
내 라이브러리에 저장했습니다.
{number}단계에서 멈췄습니다. 확인 후 현재 페이지를 확인하세요.
소스 파일 다운로드를 시작했습니다.
병렬 브라우저
앱 대시보드 목록
현재 서버 화면
실행 브라우저: {name}
키
제공 방식
파일 접기
한 번 가르치고 나중에 반복 실행
데이터베이스 다운로드에는 public의 앱 데이터와 구조만 포함됩니다. 제공업체의 인증, 저장소, 시스템 데이터, 역할, 플랫폼 설정은 포함되지 않습니다.
파일 목록을 불러오지 못했습니다. 파일을 새로고침한 후 다시 시도하세요.
새 흐름
이 작품의 agent 대화를 열 수 없습니다. 다시 시도하세요.
아직 작품 대시보드가 없습니다
현재 작품을 읽을 수 없습니다. 다시 시도하세요.
사용 가능한 용량이 있습니다
서버가 이 작업을 완료하지 못했습니다. 나중에 다시 시도하세요.
추가 제한이 명시되지 않았습니다
이번 교육을 취소했습니다.
소스 코드 보기
데이터베이스 파일 준비 중…
민감한 입력 처리 중
상대방의 승인 대기 중…
흐름과 웹사이트 메모를 읽는 중…
이 작품에는 아직 비용 기록이 없습니다.
이 단계의 웹사이트 범위
{number}단계 웹 주소
흐름과 해당 웹사이트 메모를 삭제했습니다.
흐름과 웹사이트 메모를 새로고침하지 못했습니다. 표시된 내용이 최신이 아닐 수 있습니다. 새로고침 후 다시 시도하세요.
흐름 완료
흐름 실행에 실패하여 완료되지 않았습니다
브라우저, 파일 또는 흐름 상태가 변경되었습니다. 새로고침 후 다시 시도하세요.
웹사이트 메모 지우기
로그인이 만료되었습니다. 다시 로그인하세요.
단계 제거
흐름 계속
웹사이트 메모
웹사이트 범위에는 경로 없이 https://example.com 같은 출처를 입력해야 합니다.
브라우저 보기
이 대시보드는 아직 연결되지 않았습니다. agent에게 대시보드 데이터를 요청할 수 있습니다.
유효한 HTTPS 링크를 입력하세요
비용 산정 기준
아직 저장된 흐름이 없습니다. 교육을 한 번 완료하면 여기에 표시됩니다.
이 작업
이 브라우저에는 아직 다운로드한 파일이 없습니다.
이 요청이 변경되었습니다. 새로고침하여 현재 상태를 확인하세요.
서버 화면 연결
연결 환경
브라우저 작업 선택
설정 저장소가 아직 준비되지 않았습니다. 기본 선택 항목을 표시하며 아직 저장할 수 없습니다.
자르기 초기화
비공개 입력 중: 화면 캡처와 녹화가 일시 중지되었습니다. 비밀번호와 결제 정보는 본인만 직접 입력하며 Agent는 볼 수 없습니다.
미리보기는 보기 전용입니다. 수정은 agent에게 요청하세요.
미리보기 출처
미리보기 환경
`.trim().split("\n");
const ar = `
{currency} {price} / ساعة خادم ({memory} MiB)
الملف السابق
تنزيل قاعدة البيانات
تم إرسال طلب التنزيل إلى المتصفح.
مقدمة
حالة المهمة: {state}
العنوان الخاص بالعمل
لا توجد لهذا العمل نسخة جاهزة للنشر بعد.
يمكنك تعديل الاسم والخطوات وملاحظات الموقع أو حذف سير العمل. تبدأ عمليات التشغيل الجديدة من الخطوة الأولى؛ وبعد التأكيد يمكنك المتابعة من الموضع المحفوظ على الخادم.
ليس لديك إذن لإدارة تسجيل الدخول أو التفويض لهذا المتصفح.
مثال: تنزيل التقارير أسبوعيًا
حفظ سير العمل
حفظ الاختيار لا يمنح أذونات للخدمات ولا ينشئ اتصالات ولا ينشر العمل.
اختر متصفحًا قيد التشغيل أعلاه قبل تشغيل سير العمل.
إنشاء نسخة
تحديث الملفات
الميزات
إلغاء النشر يجعل عنوان العمل غير متاح ويمسح سجل النشر.
للمعاينة فقط. أنشئ نسختك الخاصة أولًا لإجراء تعديلات.
الموصلات المتاحة ({count})
البيئة الثابتة: {environment}
الإشارة إليه في مهمة جديدة
إذا ظهر سجل المتصفح، فاختر هذه الجلسة قبل فتحه.
السعة ممتلئة
سيُستأنف التنفيذ من الموضع المسجل على الخادم.
لا توجد مهام لتغيير الإعدادات بعد
تم الحفظ في مكتبتي.
تم التوقف عند الخطوة {number}. تحقق من الصفحة الحالية بعد التأكيد.
بدأ تنزيل ملفات المصدر.
متصفحات متوازية
قائمة لوحات معلومات التطبيقات
شاشة الخادم الحالية
متصفح التنفيذ: {name}
المفتاح
طريقة التوفير
طي الملفات
علّم مرة واحدة وكرّر لاحقًا
يشمل تنزيل قاعدة البيانات بيانات التطبيق وبنيته في public فقط. ولا يشمل مصادقة المزوّد أو التخزين أو بيانات النظام أو الأدوار أو إعدادات المنصة.
تعذر تحميل قائمة الملفات. حدّث الملفات وحاول مجددًا.
سير عمل جديد
تعذر فتح محادثة الوكيل لهذا العمل. حاول مجددًا.
لا توجد لوحات معلومات للأعمال بعد
تعذرت قراءة العمل حاليًا. حاول مجددًا.
توجد سعة متاحة
لم يكمل الخادم هذه العملية. حاول لاحقًا.
لم تُعلن قيود إضافية
تم التخلي عن جلسة التعليم هذه.
عرض الشيفرة المصدرية
جارٍ تجهيز ملف قاعدة البيانات…
جارٍ معالجة إدخال حساس
بانتظار تفويض الطرف الآخر…
جارٍ قراءة مسارات العمل وملاحظات المواقع…
لا توجد سجلات تكاليف لهذا العمل بعد.
نطاق الموقع لهذه الخطوة
عنوان الويب للخطوة {number}
تم حذف سير العمل وملاحظات الموقع الخاصة به.
تعذر تحديث مسارات العمل وملاحظات المواقع. قد لا يكون المحتوى المعروض محدثًا. حدّث وحاول مجددًا.
اكتمل سير العمل
فشل تنفيذ سير العمل ولم يكتمل
تغيرت حالة المتصفح أو الملف أو سير العمل. حدّث وحاول مجددًا.
مسح ملاحظات الموقع
انتهت صلاحية تسجيل الدخول. سجّل الدخول مجددًا.
إزالة الخطوة
متابعة سير العمل
ملاحظات الموقع
يجب أن يكون نطاق الموقع أصلًا مثل https://example.com دون مسار.
مشاهدة المتصفح
لم يتم توصيل لوحة المعلومات هذه بعد. اطلب من الوكيل توفير بياناتها.
أدخل رابط HTTPS صالحًا
أساس احتساب التكلفة
لا توجد مسارات عمل محفوظة بعد. أكمل جلسة تعليم لتظهر هنا.
هذه المهمة
لم ينزّل هذا المتصفح أي ملفات بعد.
تغير هذا الطلب. حدّث لعرض حالته الحالية.
الاتصال بشاشة الخادم
بيئة الاتصال
اختيار مهمة المتصفح
تخزين الإعدادات غير جاهز بعد. تظهر الاختيارات الافتراضية ولا يمكن حفظها حاليًا.
إعادة ضبط الاقتصاص
إدخال خاص: تم إيقاف التقاط الشاشة وتسجيلها مؤقتًا. أنت وحدك من يُدخل كلمات المرور ومعلومات الدفع؛ ولا يمكن للوكيل رؤيتها.
المعاينة للعرض فقط. اطلب من الوكيل إجراء التعديلات.
مصدر المعاينة
بيئة المعاينة
`.trim().split("\n");
const th = `
{currency} {price} / ชั่วโมงเซิร์ฟเวอร์ ({memory} MiB)
ไฟล์ก่อนหน้า
ดาวน์โหลดฐานข้อมูล
ส่งคำขอดาวน์โหลดให้เบราว์เซอร์แล้ว
แนะนำ
สถานะงาน: {state}
ที่อยู่เฉพาะของผลงาน
ผลงานนี้ยังไม่มีเวอร์ชันที่พร้อมเผยแพร่
คุณแก้ไขชื่อ ขั้นตอน และบันทึกเว็บไซต์ หรือลบเวิร์กโฟลว์ได้ การเรียกใช้ใหม่จะเริ่มจากขั้นตอนแรก หลังยืนยัน คุณสามารถทำต่อจากตำแหน่งที่บันทึกไว้บนเซิร์ฟเวอร์ได้
คุณไม่มีสิทธิ์จัดการการเข้าสู่ระบบหรือการอนุญาตของเบราว์เซอร์นี้
ตัวอย่าง: ดาวน์โหลดรายงานทุกสัปดาห์
บันทึกเวิร์กโฟลว์
การบันทึกตัวเลือกไม่ได้ให้สิทธิ์บริการ สร้างการเชื่อมต่อ หรือเผยแพร่ผลงาน
เลือกเบราว์เซอร์ที่กำลังทำงานอยู่ด้านบนก่อนเรียกใช้เวิร์กโฟลว์
สร้างสำเนา
รีเฟรชไฟล์
คุณสมบัติ
เมื่อยกเลิกการเผยแพร่ จะเข้าถึงที่อยู่ผลงานไม่ได้และประวัติการเผยแพร่จะถูกล้าง
ดูตัวอย่างได้เท่านั้น หากต้องการแก้ไข โปรดสร้างสำเนาของคุณก่อน
ตัวเชื่อมต่อที่ใช้ได้ ({count})
สภาพแวดล้อมคงที่: {environment}
อ้างอิงในงานใหม่
หากแสดงประวัติเบราว์เซอร์ ให้เลือกเซสชันนี้ก่อนเปิด
ความจุเต็มแล้ว
จะทำงานต่อจากตำแหน่งที่บันทึกไว้บนเซิร์ฟเวอร์
ยังไม่มีงานเปลี่ยนการตั้งค่า
บันทึกลงในคลังของฉันแล้ว
หยุดที่ขั้นตอน {number} แล้ว หลังยืนยัน โปรดตรวจสอบหน้าปัจจุบัน
เริ่มดาวน์โหลดไฟล์ซอร์สโค้ดแล้ว
เบราว์เซอร์แบบขนาน
รายการแดชบอร์ดแอป
หน้าจอเซิร์ฟเวอร์ปัจจุบัน
เบราว์เซอร์ที่ใช้ทำงาน: {name}
ปุ่ม
รูปแบบการให้บริการ
ยุบไฟล์
สอนครั้งเดียว แล้วทำซ้ำได้ภายหลัง
การดาวน์โหลดฐานข้อมูลมีเฉพาะข้อมูลและโครงสร้างแอปใน public ไม่รวมการยืนยันตัวตน พื้นที่จัดเก็บ ข้อมูลระบบ บทบาท หรือการตั้งค่าแพลตฟอร์มของผู้ให้บริการ
โหลดรายการไฟล์ไม่สำเร็จ โปรดรีเฟรชไฟล์แล้วลองอีกครั้ง
เวิร์กโฟลว์ใหม่
เปิดการสนทนากับ agent ของผลงานนี้ไม่ได้ โปรดลองอีกครั้ง
ยังไม่มีแดชบอร์ดผลงาน
ขณะนี้อ่านผลงานไม่ได้ โปรดลองอีกครั้ง
ยังมีความจุว่าง
เซิร์ฟเวอร์ทำรายการนี้ไม่สำเร็จ โปรดลองอีกครั้งภายหลัง
ไม่ได้ระบุข้อจำกัดเพิ่มเติม
ละทิ้งการสอนครั้งนี้แล้ว
ดูซอร์สโค้ด
กำลังเตรียมไฟล์ฐานข้อมูล…
กำลังประมวลผลข้อมูลที่ละเอียดอ่อน
กำลังรอการอนุญาตจากอีกฝ่าย…
กำลังอ่านเวิร์กโฟลว์และบันทึกเว็บไซต์…
ผลงานนี้ยังไม่มีบันทึกค่าใช้จ่าย
ขอบเขตเว็บไซต์ของขั้นตอนนี้
ที่อยู่เว็บของขั้นตอน {number}
ลบเวิร์กโฟลว์และบันทึกเว็บไซต์ของเวิร์กโฟลว์แล้ว
รีเฟรชเวิร์กโฟลว์และบันทึกเว็บไซต์ไม่สำเร็จ เนื้อหาที่แสดงอาจไม่ใช่เวอร์ชันล่าสุด โปรดรีเฟรชแล้วลองอีกครั้ง
เวิร์กโฟลว์เสร็จสมบูรณ์
เรียกใช้เวิร์กโฟลว์ล้มเหลวและยังไม่เสร็จสมบูรณ์
สถานะเบราว์เซอร์ ไฟล์ หรือเวิร์กโฟลว์เปลี่ยนไป โปรดรีเฟรชแล้วลองอีกครั้ง
ล้างบันทึกเว็บไซต์
การเข้าสู่ระบบหมดอายุแล้ว โปรดเข้าสู่ระบบอีกครั้ง
ลบขั้นตอน
ทำเวิร์กโฟลว์ต่อ
บันทึกเว็บไซต์
ขอบเขตเว็บไซต์ต้องเป็นต้นทาง เช่น https://example.com โดยไม่มีเส้นทาง
ดูเบราว์เซอร์
แดชบอร์ดนี้ยังไม่ได้เชื่อมต่อ คุณขอให้ agent ส่งข้อมูลแดชบอร์ดได้
กรอกลิงก์ HTTPS ที่ถูกต้อง
เกณฑ์คำนวณค่าใช้จ่าย
ยังไม่มีเวิร์กโฟลว์ที่บันทึกไว้ เมื่อสอนเสร็จหนึ่งครั้ง เวิร์กโฟลว์จะปรากฏที่นี่
งานนี้
เบราว์เซอร์นี้ยังไม่มีไฟล์ที่ดาวน์โหลด
คำขอนี้เปลี่ยนไปแล้ว โปรดรีเฟรชเพื่อดูสถานะปัจจุบัน
เชื่อมต่อหน้าจอเซิร์ฟเวอร์
สภาพแวดล้อมการเชื่อมต่อ
เลือกงานเบราว์เซอร์
พื้นที่เก็บการตั้งค่ายังไม่พร้อม ขณะนี้แสดงตัวเลือกเริ่มต้นและยังบันทึกไม่ได้
รีเซ็ตการครอบตัด
กำลังป้อนข้อมูลส่วนตัว: หยุดการจับภาพและบันทึกหน้าจอชั่วคราว คุณต้องกรอกรหัสผ่านและข้อมูลการชำระเงินด้วยตนเองเท่านั้น Agent จะดูไม่ได้
ตัวอย่างมีไว้ดูเท่านั้น หากต้องการแก้ไข โปรดให้ agent ดำเนินการ
แหล่งที่มาของตัวอย่าง
สภาพแวดล้อมของตัวอย่าง
`.trim().split("\n");
const hi = `
{currency} {price} / सर्वर घंटा ({memory} MiB)
पिछली फ़ाइल
डेटाबेस डाउनलोड करें
डाउनलोड अनुरोध ब्राउज़र को भेज दिया गया है।
परिचय
कार्य की स्थिति: {state}
रचना का अपना पता
इस रचना का अभी कोई संस्करण प्रकाशित करने के लिए तैयार नहीं है।
आप नाम, चरण और वेबसाइट नोट्स बदल सकते हैं या वर्कफ़्लो मिटा सकते हैं। नया रन पहले चरण से शुरू होता है; पुष्टि करने के बाद सर्वर पर सहेजी गई जगह से जारी रख सकते हैं।
आपको इस ब्राउज़र का लॉगिन या प्राधिकरण प्रबंधित करने की अनुमति नहीं है।
उदाहरण: हर सप्ताह रिपोर्ट डाउनलोड करें
वर्कफ़्लो सहेजें
चयन सहेजने से सेवा की अनुमति नहीं मिलती, कनेक्शन नहीं बनता और रचना प्रकाशित नहीं होती।
वर्कफ़्लो चलाने से पहले ऊपर चल रहा ब्राउज़र चुनें।
प्रतिलिपि बनाएँ
फ़ाइलें रीफ़्रेश करें
सुविधाएँ
प्रकाशन हटाने पर रचना का पता खुल नहीं सकेगा और प्रकाशन इतिहास मिट जाएगा।
केवल पूर्वावलोकन। बदलाव के लिए पहले अपनी प्रतिलिपि बनाएँ।
उपलब्ध कनेक्टर ({count})
निश्चित परिवेश: {environment}
नए कार्य में संदर्भ दें
यदि ब्राउज़र इतिहास दिखे, तो खोलने से पहले यह सत्र चुनें।
क्षमता पूरी भर गई है
सर्वर पर दर्ज जगह से निष्पादन जारी होगा।
अभी कोई कॉन्फ़िगरेशन बदलाव कार्य नहीं है
मेरी लाइब्रेरी में सहेजा गया।
चरण {number} पर रुका है। पुष्टि के बाद वर्तमान पृष्ठ जाँचें।
स्रोत फ़ाइलों का डाउनलोड शुरू हो गया है।
समानांतर ब्राउज़र
ऐप डैशबोर्ड सूची
सर्वर की वर्तमान स्क्रीन
निष्पादन ब्राउज़र: {name}
कुंजी
प्रदान करने का तरीका
फ़ाइलें समेटें
एक बार सिखाएँ, बाद में दोहराएँ
डेटाबेस डाउनलोड में केवल public के ऐप डेटा और संरचना शामिल हैं। प्रदाता का प्रमाणीकरण, स्टोरेज, सिस्टम डेटा, भूमिकाएँ या प्लेटफ़ॉर्म सेटिंग शामिल नहीं हैं।
फ़ाइल सूची लोड नहीं हो सकी। फ़ाइलें रीफ़्रेश करके फिर कोशिश करें।
नया वर्कफ़्लो
इस रचना की agent बातचीत नहीं खुल सकी। फिर कोशिश करें।
अभी कोई रचना डैशबोर्ड नहीं है
अभी रचना पढ़ना संभव नहीं है। फिर कोशिश करें।
क्षमता उपलब्ध है
सर्वर ने यह प्रक्रिया पूरी नहीं की। कुछ देर बाद फिर कोशिश करें।
अतिरिक्त प्रतिबंध घोषित नहीं हैं
यह शिक्षण सत्र छोड़ दिया गया है।
स्रोत कोड देखें
डेटाबेस फ़ाइल तैयार की जा रही है…
संवेदनशील इनपुट संसाधित किया जा रहा है
दूसरे पक्ष की अनुमति की प्रतीक्षा है…
वर्कफ़्लो और वेबसाइट नोट्स पढ़े जा रहे हैं…
इस रचना के अभी कोई लागत रिकॉर्ड नहीं हैं।
इस चरण का वेबसाइट दायरा
चरण {number} का वेब पता
वर्कफ़्लो और उसके वेबसाइट नोट्स मिटा दिए गए हैं।
वर्कफ़्लो और वेबसाइट नोट्स रीफ़्रेश नहीं हो सके। दिखाई गई सामग्री पुरानी हो सकती है। रीफ़्रेश करके फिर कोशिश करें।
वर्कफ़्लो पूरा हुआ
वर्कफ़्लो का निष्पादन विफल रहा और अधूरा है
ब्राउज़र, फ़ाइल या वर्कफ़्लो की स्थिति बदल गई है। रीफ़्रेश करके फिर कोशिश करें।
वेबसाइट नोट्स साफ़ करें
लॉगिन की अवधि समाप्त हो गई है। फिर लॉगिन करें।
चरण हटाएँ
वर्कफ़्लो जारी रखें
वेबसाइट नोट्स
वेबसाइट दायरे में केवल https://example.com जैसा मूल पता दें, पथ शामिल न करें।
ब्राउज़र देखें
यह डैशबोर्ड अभी जुड़ा नहीं है। agent से डैशबोर्ड डेटा देने को कह सकते हैं।
मान्य HTTPS लिंक दर्ज करें
लागत का आधार
अभी कोई सहेजा हुआ वर्कफ़्लो नहीं है। एक शिक्षण सत्र पूरा करने के बाद वह यहाँ दिखेगा।
यह कार्य
इस ब्राउज़र में अभी कोई डाउनलोड की गई फ़ाइल नहीं है।
यह अनुरोध बदल गया है। वर्तमान स्थिति देखने के लिए रीफ़्रेश करें।
सर्वर स्क्रीन से जुड़ें
कनेक्शन परिवेश
ब्राउज़र कार्य चुनें
कॉन्फ़िगरेशन स्टोरेज अभी तैयार नहीं है। डिफ़ॉल्ट चयन दिखाए जा रहे हैं और अभी सहेजे नहीं जा सकते।
क्रॉप रीसेट करें
निजी इनपुट जारी है: स्क्रीन कैप्चर और रिकॉर्डिंग रुकी हुई हैं। पासवर्ड और भुगतान जानकारी केवल आप स्वयं दर्ज करते हैं; Agent इन्हें नहीं देख सकता।
पूर्वावलोकन केवल देखने के लिए है। बदलाव agent से करवाएँ।
पूर्वावलोकन स्रोत
पूर्वावलोकन परिवेश
`.trim().split("\n");

const rows: Record<Locale, readonly string[]> = {
  zh: keys, en, de, es, "es-419": es, fr, it, "pt-BR": ptBR, "pt-PT": pt,
  vi, tr, "zh-TW": zhTW, ja, ko, ar, th, hi,
};
for (const [locale, values] of Object.entries(rows)) {
  if (values.length !== keys.length) throw new Error(`UF1 copy length mismatch: ${locale}`);
}
export const UF1_MISSING_COPY_A = Object.fromEntries(
  Object.entries(rows).map(([locale, values]) => [locale, Object.fromEntries(keys.map((key, index) => [key, values[index]]))]),
) as Record<Locale, Record<string, string>>;
