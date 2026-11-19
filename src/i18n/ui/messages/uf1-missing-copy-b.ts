import type { Locale } from "../../config";

const keys = [
  "{done}/{total} 步",
  "下一个文件",
  "下载源码 ZIP",
  "不同任务可以同时使用各自的浏览器。选择一个任务观看或演示流程。",
  "以上是资源价格基准；浏览器实际扣费状态尚未确认。",
  "作品发布",
  "作品视图",
  "作品配置",
  "你正在接管浏览器。密码和付款信息只由你亲自输入；敏感输入期间会暂停画面采集与录制。",
  "使用作品配置中的托管后端认证服务。",
  "保存后，下次可以继续使用这个网站的登录。你可以在设置中查看网站记录、删除登录或关闭保存。",
  "保存登录",
  "停止已发布作品",
  "内容没有通过检查，请修改后重试。",
  "删除失败，请重试",
  "刷新配置状态",
  "单个文件上限：{size}",
  "取消指位置",
  "只这一次",
  "启动中…",
  "图片读取失败",
  "场景方案",
  "完整费用尚未确认，未提供价格的项目保持未知。",
  "容量未知",
  "尚无费率来源",
  "尚未声明接口",
  "已保存的流程与网站笔记",
  "已占用或预留的浏览器名额：{count}",
  "已有远程桌面正在使用，请先关闭它。",
  "库中的文件：{name}",
  "开始教学",
  "所有服务均可单独选择。应用选择后，agent 会创建迁移或部署任务。",
  "指位置给 agent",
  "描述你想做的作品",
  "操作太频繁或浏览器名额已满，请稍后重试。",
  "收起观看",
  "教学已停止，流程已保存。",
  "数据库配置已变更或暂不可确认，请重新下载。",
  "文件超过当前空间或大小限制。",
  "方案会填写各项服务，之后仍可逐项更改。",
  "普通文字（不填写密码或密钥）",
  "暂无网站笔记",
  "暂时无法读取服务器列表。",
  "有配置变更尚未确认。请先刷新状态或查看任务，勿重复提交。",
  "服务器没有返回可确认的结果，请刷新后重试。",
  "未能更新浏览器的登录与授权，请重试。",
  "查看仪表盘",
  "标准接口",
  "正在准备源码文件…",
  "正在提交你的选择…",
  "正在请求保存确认…",
  "正在读取浏览器任务…",
  "此操作会向网站提交信息，执行后可能无法撤回。",
  "此浏览器未绑定任务，无法按任务授权。",
  "没有收到服务器结果。请刷新确认状态，再决定是否重试。",
  "流程及网站笔记已保存。",
  "流程尚未完成，请在对应浏览器检查当前页面。",
  "流程已排队，尚未完成",
  "流程正在运行，尚未完成",
  "浏览器任务",
  "状态暂不可用",
  "确认取消发布",
  "等 {count} 个项目",
  "编辑流程",
  "网站笔记已清除。",
  "网页地址",
  "计算费用基准",
  "请先打开或恢复这个浏览器，等它运行后再开始教学。",
  "请检查流程名称和步骤。每一步都需要有效的网页或页面元素，密码和密钥只能使用密钥库引用。",
  "费用：未知",
  "还没有录下可保存的步骤。请先打开浏览器并演示，再停止并保存。",
  "这个步骤只保存密钥库引用。凭据由独立组件填写，流程不会显示密码。",
  "这条记录已不存在，请刷新后重试。",
  "连接后使用远程桌面的授权、操作与计费规则。",
  "连接状态来自实际服务检查，保存选择不代表已连接。费用按成本计算，不加价。",
  "选一个正在运行的浏览器，开始教学后打开它，接管并演示操作，最后停止并保存。密码和密钥只保存密钥库引用。",
  "配置任务",
  "配置提交结果尚未确认，请先刷新状态，勿重复提交。",
  "链接无效",
  "页面元素通过名称、标签或页面标记定位。密钥库引用会保留；这里不支持脚本。",
  "预览启动失败",
  "预览来源修改结果尚未确认，请刷新后重试。",
  "默认选择"
] as const;

// Rows follow the source-key order; regional variants share neutral wording.
const en = `{done}/{total} steps
Next file
Download source ZIP
Different tasks can use their own browsers at the same time. Choose a task to watch or demonstrate a workflow.
These are reference resource prices; actual browser billing has not been confirmed.
Publish project
Project view
Project settings
You are taking over the browser. Enter passwords and payment details yourself. Screen capture and recording pause during sensitive input.
Use the hosted backend authentication service in the project settings.
Save to reuse this website's login next time. In settings, you can review website records, delete logins, or turn off saving.
Save login
Stop published project
The content did not pass the checks. Revise it and try again.
Deletion failed. Try again.
Refresh configuration status
Maximum file size: {size}
Cancel pointing
Just this once
Starting…
Failed to read image
Scenario plan
The full cost is not yet confirmed. Items without prices remain unknown.
Capacity unknown
No rate source yet
No interfaces declared yet
Saved workflows and website notes
Browser slots in use or reserved: {count}
A remote desktop is already in use. Close it first.
File in Library: {name}
Start teaching
Each service can be selected separately. After you apply your choices, the agent will create migration or deployment tasks.
Point out a location to the agent
Describe the project you want to create
Too many actions or no browser slots available. Try again later.
Collapse viewer
Teaching stopped. Workflow saved.
Database settings have changed or cannot currently be verified. Download again.
The file exceeds the current space or size limit.
The plan fills in the services. You can still change each one afterward.
Plain text (do not enter passwords or keys)
No website notes yet
Cannot read the server list right now.
Some configuration changes are unconfirmed. Refresh the status or check the task before submitting again.
The server did not return a verifiable result. Refresh and try again.
Could not update the browser's login and permissions. Try again.
View dashboard
Standard interface
Preparing source files…
Submitting your choices…
Requesting save confirmation…
Reading browser tasks…
This action submits information to the website and may be irreversible.
This browser has no linked task and cannot receive task-based authorization.
No server result received. Refresh to confirm the status before deciding whether to retry.
Workflow and website notes saved.
The workflow is not finished. Check the current page in its browser.
Workflow queued, not finished yet
Workflow running, not finished yet
Browser tasks
Status temporarily unavailable
Confirm unpublishing
and {count} other items
Edit workflow
Website notes cleared.
Web address
Calculate reference cost
Open or restore this browser first. Wait until it is running before starting teaching.
Check the workflow name and steps. Each step needs a valid web page or page element. Passwords and keys must use vault references.
Cost: unknown
No steps have been recorded to save yet. Open the browser and demonstrate first, then stop and save.
This step saves only a vault reference. A separate component enters credentials; the workflow never displays passwords.
This record no longer exists. Refresh and try again.
Once connected, remote desktop authorization, operation, and billing rules apply.
Connection status comes from actual service checks. Saving choices does not mean a connection exists. Charges are at cost, with no markup.
Choose a running browser. Start teaching, open it, take over and demonstrate, then stop and save. Passwords and keys are saved only as vault references.
Configuration task
The configuration submission result is unconfirmed. Refresh the status before submitting again.
Invalid link
Page elements are located by name, label, or page marker. Vault references are retained; scripts are not supported here.
Preview failed to start
The preview source change is unconfirmed. Refresh and try again.
Default selection`.split("\n");

const de = `{done}/{total} Schritte
Nächste Datei
Quellcode als ZIP herunterladen
Verschiedene Aufgaben können gleichzeitig eigene Browser nutzen. Wählen Sie eine Aufgabe, um einen Ablauf anzusehen oder vorzuführen.
Dies sind Richtpreise für Ressourcen; die tatsächliche Browserabrechnung ist noch nicht bestätigt.
Projekt veröffentlichen
Projektansicht
Projekteinstellungen
Sie übernehmen den Browser. Geben Sie Passwörter und Zahlungsdaten selbst ein. Bei sensiblen Eingaben werden Bildschirmaufnahme und Aufzeichnung pausiert.
Den gehosteten Backend-Authentifizierungsdienst aus den Projekteinstellungen verwenden.
Speichern Sie die Anmeldung, um sie beim nächsten Besuch wiederzuverwenden. In den Einstellungen können Sie Website-Einträge ansehen, Anmeldungen löschen oder das Speichern deaktivieren.
Anmeldung speichern
Veröffentlichtes Projekt stoppen
Der Inhalt hat die Prüfung nicht bestanden. Überarbeiten Sie ihn und versuchen Sie es erneut.
Löschen fehlgeschlagen. Erneut versuchen.
Konfigurationsstatus aktualisieren
Maximale Dateigröße: {size}
Zeigen abbrechen
Nur dieses Mal
Wird gestartet…
Bild konnte nicht gelesen werden
Szenarioplan
Die Gesamtkosten sind noch nicht bestätigt. Posten ohne Preis bleiben unbekannt.
Kapazität unbekannt
Noch keine Tarifquelle
Noch keine Schnittstellen deklariert
Gespeicherte Abläufe und Website-Notizen
Belegte oder reservierte Browserplätze: {count}
Ein Remotedesktop wird bereits verwendet. Schließen Sie ihn zuerst.
Datei in der Bibliothek: {name}
Vorführung starten
Jeder Dienst ist einzeln wählbar. Nach dem Übernehmen erstellt der Agent Migrations- oder Bereitstellungsaufgaben.
Dem Agenten eine Stelle zeigen
Beschreiben Sie das gewünschte Projekt
Zu viele Aktionen oder alle Browserplätze belegt. Versuchen Sie es später erneut.
Zuschauansicht einklappen
Vorführung beendet. Ablauf gespeichert.
Die Datenbankeinstellungen wurden geändert oder sind derzeit nicht überprüfbar. Laden Sie sie erneut herunter.
Die Datei überschreitet das aktuelle Speicherplatz- oder Größenlimit.
Der Plan trägt die Dienste ein. Sie können sie anschließend einzeln ändern.
Normaler Text (keine Passwörter oder Schlüssel eingeben)
Noch keine Website-Notizen
Die Serverliste kann derzeit nicht gelesen werden.
Konfigurationsänderungen sind noch unbestätigt. Aktualisieren Sie den Status oder prüfen Sie die Aufgabe, bevor Sie erneut absenden.
Der Server hat kein überprüfbares Ergebnis geliefert. Aktualisieren Sie und versuchen Sie es erneut.
Browseranmeldung und Berechtigungen konnten nicht aktualisiert werden. Erneut versuchen.
Dashboard anzeigen
Standardschnittstelle
Quelldateien werden vorbereitet…
Ihre Auswahl wird übermittelt…
Speicherbestätigung wird angefordert…
Browseraufgaben werden gelesen…
Diese Aktion übermittelt Informationen an die Website und lässt sich möglicherweise nicht rückgängig machen.
Dieser Browser ist keiner Aufgabe zugeordnet und kann nicht aufgabenbezogen autorisiert werden.
Kein Serverergebnis erhalten. Aktualisieren Sie zur Statusprüfung, bevor Sie über einen neuen Versuch entscheiden.
Ablauf und Website-Notizen gespeichert.
Der Ablauf ist noch nicht abgeschlossen. Prüfen Sie die aktuelle Seite im zugehörigen Browser.
Ablauf eingereiht, noch nicht abgeschlossen
Ablauf läuft, noch nicht abgeschlossen
Browseraufgaben
Status vorübergehend nicht verfügbar
Veröffentlichung aufheben bestätigen
und {count} weitere Einträge
Ablauf bearbeiten
Website-Notizen gelöscht.
Webadresse
Richtkosten berechnen
Öffnen Sie diesen Browser zuerst oder stellen Sie ihn wieder her. Warten Sie, bis er läuft, bevor Sie die Vorführung starten.
Prüfen Sie Namen und Schritte des Ablaufs. Jeder Schritt benötigt eine gültige Webseite oder ein Seitenelement. Passwörter und Schlüssel müssen Tresorverweise verwenden.
Kosten: unbekannt
Es wurden noch keine speicherbaren Schritte aufgezeichnet. Öffnen Sie den Browser und führen Sie die Aktionen vor, dann stoppen und speichern Sie.
Dieser Schritt speichert nur einen Tresorverweis. Eine separate Komponente gibt die Zugangsdaten ein; der Ablauf zeigt keine Passwörter.
Dieser Eintrag existiert nicht mehr. Aktualisieren Sie und versuchen Sie es erneut.
Nach dem Verbinden gelten die Autorisierungs-, Bedienungs- und Abrechnungsregeln des Remotedesktops.
Der Verbindungsstatus stammt aus tatsächlichen Dienstprüfungen. Eine gespeicherte Auswahl bedeutet keine Verbindung. Abgerechnet wird zu Selbstkosten ohne Aufschlag.
Wählen Sie einen laufenden Browser. Starten Sie die Vorführung, öffnen und übernehmen Sie ihn und zeigen Sie die Aktionen. Danach stoppen und speichern. Passwörter und Schlüssel werden nur als Tresorverweise gespeichert.
Konfigurationsaufgabe
Das Ergebnis der Konfigurationsübermittlung ist unbestätigt. Aktualisieren Sie den Status, bevor Sie erneut absenden.
Ungültiger Link
Seitenelemente werden anhand von Namen, Beschriftung oder Seitenmarkierung gefunden. Tresorverweise bleiben erhalten; Skripte werden hier nicht unterstützt.
Vorschau konnte nicht gestartet werden
Die Änderung der Vorschauquelle ist unbestätigt. Aktualisieren Sie und versuchen Sie es erneut.
Standardauswahl`.split("\n");

const es = `{done}/{total} pasos
Siguiente archivo
Descargar código fuente ZIP
Las distintas tareas pueden usar sus propios navegadores al mismo tiempo. Elige una tarea para ver o demostrar un flujo.
Estos son precios de referencia de recursos; el cobro real del navegador aún no está confirmado.
Publicar proyecto
Vista del proyecto
Configuración del proyecto
Estás tomando el control del navegador. Introduce tú las contraseñas y los datos de pago. La captura de pantalla y la grabación se pausarán durante las entradas sensibles.
Usar el servicio de autenticación del backend alojado en la configuración del proyecto.
Guarda el acceso para reutilizarlo la próxima vez en este sitio. En ajustes puedes ver los registros de sitios, eliminar accesos o desactivar el guardado.
Guardar acceso
Detener proyecto publicado
El contenido no superó la revisión. Modifícalo e inténtalo de nuevo.
No se pudo eliminar. Inténtalo de nuevo.
Actualizar estado de configuración
Tamaño máximo por archivo: {size}
Cancelar señalamiento
Solo esta vez
Iniciando…
No se pudo leer la imagen
Plan de escenario
El costo total aún no está confirmado. Los elementos sin precio siguen siendo desconocidos.
Capacidad desconocida
Aún no hay fuente de tarifas
Aún no se han declarado interfaces
Flujos y notas de sitios guardados
Plazas de navegador ocupadas o reservadas: {count}
Ya hay un escritorio remoto en uso. Ciérralo primero.
Archivo en la biblioteca: {name}
Iniciar enseñanza
Cada servicio se puede elegir por separado. Al aplicar la selección, el agente creará tareas de migración o despliegue.
Señalar una ubicación al agente
Describe el proyecto que quieres crear
Demasiadas acciones o no quedan plazas de navegador. Inténtalo más tarde.
Contraer vista
Enseñanza detenida. Flujo guardado.
La configuración de la base de datos cambió o no se puede verificar ahora. Descárgala de nuevo.
El archivo supera el límite actual de espacio o tamaño.
El plan completa los servicios. Después puedes cambiar cada uno por separado.
Texto normal (no introduzcas contraseñas ni claves)
Aún no hay notas del sitio
No se puede leer la lista de servidores en este momento.
Hay cambios de configuración sin confirmar. Actualiza el estado o revisa la tarea antes de volver a enviar.
El servidor no devolvió un resultado verificable. Actualiza e inténtalo de nuevo.
No se pudieron actualizar el acceso y los permisos del navegador. Inténtalo de nuevo.
Ver panel
Interfaz estándar
Preparando archivos de código fuente…
Enviando tu selección…
Solicitando confirmación de guardado…
Leyendo tareas del navegador…
Esta acción enviará información al sitio y puede ser irreversible.
Este navegador no tiene una tarea vinculada y no admite autorización por tarea.
No se recibió el resultado del servidor. Actualiza para confirmar el estado antes de decidir si reintentas.
Flujo y notas del sitio guardados.
El flujo no ha terminado. Revisa la página actual en el navegador correspondiente.
Flujo en cola, aún sin terminar
Flujo en ejecución, aún sin terminar
Tareas del navegador
Estado no disponible temporalmente
Confirmar retirada de publicación
y otros {count} elementos
Editar flujo
Notas del sitio borradas.
Dirección web
Calcular costo de referencia
Abre o restaura primero este navegador. Espera a que esté en ejecución antes de iniciar la enseñanza.
Revisa el nombre y los pasos del flujo. Cada paso necesita una página o un elemento válido. Las contraseñas y claves deben usar referencias a la bóveda.
Costo: desconocido
Aún no se han grabado pasos para guardar. Abre el navegador y demuestra las acciones; después detén y guarda.
Este paso solo guarda una referencia a la bóveda. Un componente independiente introduce las credenciales; el flujo no muestra contraseñas.
Este registro ya no existe. Actualiza e inténtalo de nuevo.
Tras conectarte, se aplican las reglas de autorización, operación y facturación del escritorio remoto.
El estado de conexión proviene de comprobaciones reales del servicio. Guardar la selección no implica estar conectado. Se cobra al costo, sin recargo.
Elige un navegador en ejecución. Inicia la enseñanza, ábrelo, toma el control y demuestra las acciones; después detén y guarda. Las contraseñas y claves solo se guardan como referencias a la bóveda.
Tarea de configuración
El resultado del envío de configuración no está confirmado. Actualiza el estado antes de volver a enviar.
Enlace no válido
Los elementos se localizan por nombre, etiqueta o marcador de página. Se conservan las referencias a la bóveda; aquí no se admiten scripts.
No se pudo iniciar la vista previa
El cambio del origen de la vista previa no está confirmado. Actualiza e inténtalo de nuevo.
Selección predeterminada`.split("\n");

const fr = `{done}/{total} étapes
Fichier suivant
Télécharger le code source ZIP
Les tâches peuvent utiliser leurs propres navigateurs simultanément. Choisissez une tâche pour regarder ou démontrer un processus.
Ces prix de ressources sont indicatifs ; la facturation réelle du navigateur reste à confirmer.
Publier le projet
Vue du projet
Configuration du projet
Vous prenez le contrôle du navigateur. Saisissez vous-même les mots de passe et les données de paiement. La capture et l'enregistrement de l'écran sont suspendus pendant les saisies sensibles.
Utiliser le service d'authentification du backend hébergé dans la configuration du projet.
Enregistrez la connexion pour la réutiliser sur ce site. Dans les paramètres, vous pouvez consulter les sites enregistrés, supprimer les connexions ou désactiver l'enregistrement.
Enregistrer la connexion
Arrêter le projet publié
Le contenu n'a pas passé les vérifications. Modifiez-le et réessayez.
Échec de la suppression. Réessayez.
Actualiser l'état de configuration
Taille maximale par fichier : {size}
Annuler le pointage
Cette fois seulement
Démarrage…
Impossible de lire l'image
Plan du scénario
Le coût total reste à confirmer. Les postes sans prix restent inconnus.
Capacité inconnue
Aucune source de tarif pour le moment
Aucune interface déclarée pour le moment
Processus et notes de sites enregistrés
Places de navigateur utilisées ou réservées : {count}
Un bureau à distance est déjà utilisé. Fermez-le d'abord.
Fichier dans la bibliothèque : {name}
Commencer l'apprentissage
Chaque service peut être choisi séparément. Après application des choix, l'agent créera des tâches de migration ou de déploiement.
Montrer un emplacement à l'agent
Décrivez le projet à créer
Trop d'actions ou aucune place de navigateur disponible. Réessayez plus tard.
Réduire la vue
Apprentissage arrêté. Processus enregistré.
La configuration de la base de données a changé ou ne peut pas être vérifiée actuellement. Téléchargez-la à nouveau.
Le fichier dépasse la limite actuelle d'espace ou de taille.
Le plan renseigne les services. Vous pourrez ensuite les modifier individuellement.
Texte simple (sans mot de passe ni clé)
Aucune note de site pour le moment
Impossible de lire la liste des serveurs actuellement.
Des changements de configuration restent à confirmer. Actualisez l'état ou consultez la tâche avant de soumettre à nouveau.
Le serveur n'a pas renvoyé de résultat vérifiable. Actualisez et réessayez.
Impossible de mettre à jour la connexion et les autorisations du navigateur. Réessayez.
Voir le tableau de bord
Interface standard
Préparation des fichiers source…
Envoi de vos choix…
Demande de confirmation d'enregistrement…
Lecture des tâches du navigateur…
Cette action envoie des informations au site et peut être irréversible.
Ce navigateur n'est lié à aucune tâche et ne permet pas d'autorisation par tâche.
Aucun résultat reçu du serveur. Actualisez pour confirmer l'état avant de décider de réessayer.
Processus et notes du site enregistrés.
Le processus n'est pas terminé. Vérifiez la page actuelle dans le navigateur correspondant.
Processus en attente, pas encore terminé
Processus en cours, pas encore terminé
Tâches du navigateur
État temporairement indisponible
Confirmer le retrait de publication
et {count} autres éléments
Modifier le processus
Notes du site effacées.
Adresse web
Calculer le coût de référence
Ouvrez ou restaurez d'abord ce navigateur. Attendez qu'il fonctionne avant de commencer l'apprentissage.
Vérifiez le nom et les étapes du processus. Chaque étape nécessite une page ou un élément valide. Les mots de passe et les clés doivent utiliser des références au coffre-fort.
Coût : inconnu
Aucune étape à enregistrer n'a encore été capturée. Ouvrez le navigateur et montrez les actions, puis arrêtez et enregistrez.
Cette étape ne conserve qu'une référence au coffre-fort. Un composant indépendant saisit les identifiants ; le processus n'affiche pas les mots de passe.
Cet enregistrement n'existe plus. Actualisez et réessayez.
Après connexion, les règles d'autorisation, d'utilisation et de facturation du bureau à distance s'appliquent.
L'état de connexion provient de vérifications réelles du service. Enregistrer les choix ne signifie pas être connecté. Les frais sont calculés au coût réel, sans majoration.
Choisissez un navigateur actif. Commencez l'apprentissage, ouvrez-le, prenez le contrôle et montrez les actions, puis arrêtez et enregistrez. Les mots de passe et les clés sont uniquement conservés sous forme de références au coffre-fort.
Tâche de configuration
Le résultat de l'envoi de configuration reste à confirmer. Actualisez l'état avant de soumettre à nouveau.
Lien non valide
Les éléments sont repérés par nom, libellé ou marqueur de page. Les références au coffre-fort sont conservées ; les scripts ne sont pas pris en charge ici.
Échec du démarrage de l'aperçu
Le changement de source de l'aperçu reste à confirmer. Actualisez et réessayez.
Sélection par défaut`.split("\n");

const it = `{done}/{total} passaggi
File successivo
Scarica sorgenti ZIP
Attività diverse possono usare contemporaneamente i propri browser. Scegli un'attività per guardare o dimostrare un flusso.
Questi sono prezzi di riferimento delle risorse; l'addebito effettivo del browser non è ancora confermato.
Pubblica progetto
Vista progetto
Configurazione progetto
Stai prendendo il controllo del browser. Inserisci personalmente password e dati di pagamento. Acquisizione e registrazione dello schermo si interrompono durante l'inserimento di dati sensibili.
Usa il servizio di autenticazione del backend ospitato nella configurazione del progetto.
Salva l'accesso per riutilizzarlo su questo sito. Nelle impostazioni puoi consultare i siti registrati, eliminare gli accessi o disattivare il salvataggio.
Salva accesso
Arresta progetto pubblicato
Il contenuto non ha superato i controlli. Modificalo e riprova.
Eliminazione non riuscita. Riprova.
Aggiorna stato configurazione
Dimensione massima per file: {size}
Annulla indicazione
Solo questa volta
Avvio…
Impossibile leggere l'immagine
Piano dello scenario
Il costo totale non è ancora confermato. Le voci senza prezzo restano sconosciute.
Capacità sconosciuta
Nessuna fonte delle tariffe disponibile
Nessuna interfaccia dichiarata
Flussi e note dei siti salvati
Posti browser occupati o riservati: {count}
Un desktop remoto è già in uso. Chiudilo prima.
File nella raccolta: {name}
Avvia insegnamento
Ogni servizio può essere scelto separatamente. Dopo l'applicazione delle scelte, l'agente creerà attività di migrazione o distribuzione.
Indica un punto all'agente
Descrivi il progetto che vuoi creare
Troppe operazioni o nessun posto browser disponibile. Riprova più tardi.
Comprimi visualizzazione
Insegnamento interrotto. Flusso salvato.
La configurazione del database è cambiata o non è verificabile al momento. Scaricala di nuovo.
Il file supera il limite attuale di spazio o dimensione.
Il piano compila i servizi. Potrai modificarli singolarmente in seguito.
Testo normale (non inserire password o chiavi)
Nessuna nota del sito
Impossibile leggere l'elenco dei server al momento.
Alcune modifiche di configurazione non sono confermate. Aggiorna lo stato o controlla l'attività prima di inviare di nuovo.
Il server non ha restituito un risultato verificabile. Aggiorna e riprova.
Impossibile aggiornare l'accesso e le autorizzazioni del browser. Riprova.
Visualizza pannello
Interfaccia standard
Preparazione dei file sorgente…
Invio delle tue scelte…
Richiesta di conferma del salvataggio…
Lettura delle attività del browser…
Questa azione invia informazioni al sito e potrebbe essere irreversibile.
Questo browser non è collegato a un'attività e non può ricevere autorizzazioni per attività.
Nessun risultato ricevuto dal server. Aggiorna per verificare lo stato prima di decidere se riprovare.
Flusso e note del sito salvati.
Il flusso non è terminato. Controlla la pagina attuale nel browser corrispondente.
Flusso in coda, non ancora terminato
Flusso in esecuzione, non ancora terminato
Attività del browser
Stato temporaneamente non disponibile
Conferma ritiro dalla pubblicazione
e altri {count} elementi
Modifica flusso
Note del sito cancellate.
Indirizzo web
Calcola costo di riferimento
Apri o ripristina prima questo browser. Attendi che sia in esecuzione prima di iniziare l'insegnamento.
Controlla nome e passaggi del flusso. Ogni passaggio richiede una pagina o un elemento valido. Password e chiavi devono usare riferimenti alla cassaforte.
Costo: sconosciuto
Non sono stati registrati passaggi da salvare. Apri il browser e dimostra le azioni, poi interrompi e salva.
Questo passaggio salva solo un riferimento alla cassaforte. Un componente separato inserisce le credenziali; il flusso non mostra password.
Questo record non esiste più. Aggiorna e riprova.
Dopo la connessione si applicano le regole di autorizzazione, utilizzo e fatturazione del desktop remoto.
Lo stato della connessione deriva da controlli effettivi del servizio. Salvare le scelte non significa essere connessi. I costi sono addebitati al costo effettivo, senza maggiorazioni.
Scegli un browser in esecuzione. Avvia l'insegnamento, aprilo, prendine il controllo e dimostra le azioni, poi interrompi e salva. Password e chiavi sono salvate solo come riferimenti alla cassaforte.
Attività di configurazione
Il risultato dell'invio della configurazione non è confermato. Aggiorna lo stato prima di inviare di nuovo.
Link non valido
Gli elementi vengono individuati per nome, etichetta o marcatore di pagina. I riferimenti alla cassaforte sono mantenuti; gli script non sono supportati qui.
Avvio dell'anteprima non riuscito
La modifica dell'origine dell'anteprima non è confermata. Aggiorna e riprova.
Selezione predefinita`.split("\n");

const pt = `{done}/{total} passos
Próximo ficheiro
Descarregar código-fonte ZIP
Tarefas diferentes podem usar os seus próprios navegadores ao mesmo tempo. Escolha uma tarefa para ver ou demonstrar um fluxo.
Estes são preços de referência dos recursos; a cobrança real do navegador ainda não foi confirmada.
Publicar projeto
Vista do projeto
Configuração do projeto
Está a assumir o controlo do navegador. Introduza pessoalmente as palavras-passe e os dados de pagamento. A captura e a gravação do ecrã são suspensas durante a introdução de dados sensíveis.
Usar o serviço de autenticação do backend alojado na configuração do projeto.
Guarde o acesso para o reutilizar neste site. Nas definições pode consultar os registos dos sites, eliminar acessos ou desativar a gravação.
Guardar acesso
Parar projeto publicado
O conteúdo não passou nas verificações. Altere-o e tente novamente.
Não foi possível eliminar. Tente novamente.
Atualizar estado da configuração
Tamanho máximo por ficheiro: {size}
Cancelar indicação
Só desta vez
A iniciar…
Não foi possível ler a imagem
Plano do cenário
O custo total ainda não foi confirmado. Os itens sem preço continuam desconhecidos.
Capacidade desconhecida
Ainda não há fonte de tarifas
Ainda não há interfaces declaradas
Fluxos e notas de sites guardados
Vagas de navegador ocupadas ou reservadas: {count}
Já existe um ambiente de trabalho remoto em uso. Feche-o primeiro.
Ficheiro na biblioteca: {name}
Iniciar ensino
Cada serviço pode ser escolhido separadamente. Após aplicar as escolhas, o agente criará tarefas de migração ou implementação.
Indicar uma posição ao agente
Descreva o projeto que pretende criar
Demasiadas operações ou sem vagas de navegador. Tente mais tarde.
Recolher visualização
Ensino parado. Fluxo guardado.
A configuração da base de dados mudou ou não pode ser verificada neste momento. Descarregue-a novamente.
O ficheiro ultrapassa o limite atual de espaço ou tamanho.
O plano preenche os serviços. Depois pode alterar cada um individualmente.
Texto simples (não introduza palavras-passe nem chaves)
Ainda não há notas do site
Não é possível ler a lista de servidores neste momento.
Existem alterações de configuração por confirmar. Atualize o estado ou consulte a tarefa antes de voltar a enviar.
O servidor não devolveu um resultado verificável. Atualize e tente novamente.
Não foi possível atualizar o acesso e as permissões do navegador. Tente novamente.
Ver painel
Interface padrão
A preparar ficheiros de código-fonte…
A enviar as suas escolhas…
A pedir confirmação de gravação…
A ler tarefas do navegador…
Esta ação envia informações ao site e pode ser irreversível.
Este navegador não tem uma tarefa associada e não permite autorização por tarefa.
Não foi recebido um resultado do servidor. Atualize para confirmar o estado antes de decidir se tenta novamente.
Fluxo e notas do site guardados.
O fluxo ainda não terminou. Verifique a página atual no navegador correspondente.
Fluxo em fila, ainda não concluído
Fluxo em execução, ainda não concluído
Tarefas do navegador
Estado temporariamente indisponível
Confirmar remoção da publicação
e outros {count} itens
Editar fluxo
Notas do site apagadas.
Endereço web
Calcular custo de referência
Abra ou restaure primeiro este navegador. Espere que esteja em execução antes de iniciar o ensino.
Verifique o nome e os passos do fluxo. Cada passo precisa de uma página ou elemento válido. As palavras-passe e chaves devem usar referências ao cofre.
Custo: desconhecido
Ainda não foram gravados passos para guardar. Abra o navegador e demonstre as ações; depois pare e guarde.
Este passo guarda apenas uma referência ao cofre. Um componente independente preenche as credenciais; o fluxo não mostra palavras-passe.
Este registo já não existe. Atualize e tente novamente.
Após a ligação, aplicam-se as regras de autorização, operação e faturação do ambiente de trabalho remoto.
O estado da ligação provém de verificações reais do serviço. Guardar as escolhas não significa estar ligado. A cobrança é feita ao custo, sem acréscimo.
Escolha um navegador em execução. Inicie o ensino, abra-o, assuma o controlo e demonstre as ações; depois pare e guarde. As palavras-passe e chaves são guardadas apenas como referências ao cofre.
Tarefa de configuração
O resultado do envio da configuração não está confirmado. Atualize o estado antes de voltar a enviar.
Ligação inválida
Os elementos são localizados pelo nome, rótulo ou marcador da página. As referências ao cofre são mantidas; os scripts não são suportados aqui.
Não foi possível iniciar a pré-visualização
A alteração da origem da pré-visualização não está confirmada. Atualize e tente novamente.
Seleção predefinida`.split("\n");

const ptBR = `{done}/{total} etapas
Próximo arquivo
Baixar código-fonte ZIP
Tarefas diferentes podem usar seus próprios navegadores ao mesmo tempo. Escolha uma tarefa para assistir ou demonstrar um fluxo.
Estes são preços de referência dos recursos; a cobrança real do navegador ainda não foi confirmada.
Publicar projeto
Visualização do projeto
Configuração do projeto
Você está assumindo o controle do navegador. Digite pessoalmente as senhas e os dados de pagamento. A captura e a gravação da tela são pausadas durante a entrada de dados sensíveis.
Usar o serviço de autenticação do backend hospedado na configuração do projeto.
Salve o acesso para reutilizá-lo neste site. Nas configurações, você pode consultar os registros dos sites, excluir acessos ou desativar o salvamento.
Salvar acesso
Parar projeto publicado
O conteúdo não passou nas verificações. Altere e tente novamente.
Não foi possível excluir. Tente novamente.
Atualizar status da configuração
Tamanho máximo por arquivo: {size}
Cancelar indicação
Só desta vez
Iniciando…
Não foi possível ler a imagem
Plano do cenário
O custo total ainda não foi confirmado. Os itens sem preço continuam desconhecidos.
Capacidade desconhecida
Ainda não há fonte de tarifas
Ainda não há interfaces declaradas
Fluxos e notas de sites salvos
Vagas de navegador ocupadas ou reservadas: {count}
Já existe uma área de trabalho remota em uso. Feche-a primeiro.
Arquivo na biblioteca: {name}
Iniciar ensino
Cada serviço pode ser escolhido separadamente. Após aplicar as escolhas, o agente criará tarefas de migração ou implantação.
Indicar uma posição ao agente
Descreva o projeto que deseja criar
Muitas operações ou sem vagas de navegador. Tente mais tarde.
Recolher visualização
Ensino interrompido. Fluxo salvo.
A configuração do banco de dados mudou ou não pode ser verificada agora. Baixe novamente.
O arquivo ultrapassa o limite atual de espaço ou tamanho.
O plano preenche os serviços. Depois você pode alterar cada um individualmente.
Texto simples (não digite senhas nem chaves)
Ainda não há notas do site
Não é possível ler a lista de servidores agora.
Existem alterações de configuração não confirmadas. Atualize o status ou consulte a tarefa antes de enviar novamente.
O servidor não retornou um resultado verificável. Atualize e tente novamente.
Não foi possível atualizar o acesso e as permissões do navegador. Tente novamente.
Ver painel
Interface padrão
Preparando arquivos de código-fonte…
Enviando suas escolhas…
Solicitando confirmação de salvamento…
Lendo tarefas do navegador…
Esta ação envia informações ao site e pode ser irreversível.
Este navegador não tem uma tarefa vinculada e não permite autorização por tarefa.
Nenhum resultado recebido do servidor. Atualize para confirmar o status antes de decidir se tenta novamente.
Fluxo e notas do site salvos.
O fluxo ainda não terminou. Verifique a página atual no navegador correspondente.
Fluxo na fila, ainda não concluído
Fluxo em execução, ainda não concluído
Tarefas do navegador
Status temporariamente indisponível
Confirmar remoção da publicação
e outros {count} itens
Editar fluxo
Notas do site apagadas.
Endereço web
Calcular custo de referência
Abra ou restaure primeiro este navegador. Espere que esteja em execução antes de iniciar o ensino.
Verifique o nome e as etapas do fluxo. Cada etapa precisa de uma página ou elemento válido. As senhas e chaves devem usar referências ao cofre.
Custo: desconhecido
Ainda não foram gravadas etapas para salvar. Abra o navegador e demonstre as ações; depois pare e salve.
Esta etapa salva apenas uma referência ao cofre. Um componente independente preenche as credenciais; o fluxo não mostra senhas.
Este registro já não existe. Atualize e tente novamente.
Após a conexão, aplicam-se as regras de autorização, operação e faturamento da área de trabalho remota.
O status da conexão vem de verificações reais do serviço. Salvar as escolhas não significa estar conectado. A cobrança é feita a preço de custo, sem acréscimo.
Escolha um navegador em execução. Inicie o ensino, abra-o, assuma o controle e demonstre as ações; depois pare e salve. As senhas e chaves são salvas apenas como referências ao cofre.
Tarefa de configuração
O resultado do envio da configuração não está confirmado. Atualize o status antes de enviar novamente.
Link inválido
Os elementos são localizados pelo nome, rótulo ou marcador da página. As referências ao cofre são mantidas; scripts não são aceitos aqui.
Não foi possível iniciar a prévia
A alteração da origem da prévia não está confirmada. Atualize e tente novamente.
Seleção padrão`.split("\n");

const vi = `{done}/{total} bước
Tệp tiếp theo
Tải mã nguồn ZIP
Các tác vụ khác nhau có thể dùng trình duyệt riêng cùng lúc. Chọn tác vụ để xem hoặc hướng dẫn quy trình.
Đây là giá tài nguyên tham khảo; tình trạng tính phí thực tế của trình duyệt chưa được xác nhận.
Xuất bản dự án
Chế độ xem dự án
Cấu hình dự án
Bạn đang tiếp quản trình duyệt. Hãy tự nhập mật khẩu và thông tin thanh toán. Việc chụp và ghi màn hình sẽ tạm dừng khi nhập dữ liệu nhạy cảm.
Dùng dịch vụ xác thực backend được lưu trữ trong cấu hình dự án.
Lưu để dùng lại thông tin đăng nhập của trang này lần sau. Trong cài đặt, bạn có thể xem hồ sơ trang, xóa thông tin đăng nhập hoặc tắt lưu.
Lưu đăng nhập
Dừng dự án đã xuất bản
Nội dung không vượt qua kiểm tra. Hãy sửa rồi thử lại.
Xóa thất bại. Hãy thử lại.
Làm mới trạng thái cấu hình
Kích thước tối đa mỗi tệp: {size}
Hủy chỉ vị trí
Chỉ lần này
Đang khởi động…
Không đọc được ảnh
Phương án tình huống
Tổng chi phí chưa được xác nhận. Các mục chưa có giá vẫn chưa xác định.
Chưa rõ dung lượng
Chưa có nguồn đơn giá
Chưa khai báo giao diện
Quy trình và ghi chú trang web đã lưu
Số chỗ trình duyệt đã dùng hoặc đặt trước: {count}
Một màn hình từ xa đang được sử dụng. Hãy đóng nó trước.
Tệp trong thư viện: {name}
Bắt đầu hướng dẫn
Có thể chọn riêng từng dịch vụ. Sau khi áp dụng lựa chọn, agent sẽ tạo tác vụ di chuyển hoặc triển khai.
Chỉ vị trí cho agent
Mô tả dự án bạn muốn tạo
Thao tác quá nhiều hoặc hết chỗ trình duyệt. Hãy thử lại sau.
Thu gọn màn hình xem
Đã dừng hướng dẫn và lưu quy trình.
Cấu hình cơ sở dữ liệu đã thay đổi hoặc hiện chưa thể xác minh. Hãy tải lại.
Tệp vượt quá giới hạn dung lượng hoặc kích thước hiện tại.
Phương án sẽ điền các dịch vụ. Bạn vẫn có thể thay đổi từng dịch vụ sau đó.
Văn bản thường (không nhập mật khẩu hoặc khóa)
Chưa có ghi chú trang web
Hiện không thể đọc danh sách máy chủ.
Có thay đổi cấu hình chưa được xác nhận. Hãy làm mới trạng thái hoặc xem tác vụ trước khi gửi lại.
Máy chủ không trả về kết quả có thể xác minh. Hãy làm mới rồi thử lại.
Không cập nhật được đăng nhập và quyền của trình duyệt. Hãy thử lại.
Xem bảng điều khiển
Giao diện tiêu chuẩn
Đang chuẩn bị tệp mã nguồn…
Đang gửi lựa chọn của bạn…
Đang yêu cầu xác nhận lưu…
Đang đọc tác vụ trình duyệt…
Thao tác này gửi thông tin đến trang web và có thể không hoàn tác được.
Trình duyệt này chưa liên kết tác vụ nên không thể cấp quyền theo tác vụ.
Chưa nhận được kết quả máy chủ. Hãy làm mới để xác nhận trạng thái trước khi quyết định thử lại.
Đã lưu quy trình và ghi chú trang web.
Quy trình chưa hoàn tất. Hãy kiểm tra trang hiện tại trong trình duyệt tương ứng.
Quy trình đã xếp hàng, chưa hoàn tất
Quy trình đang chạy, chưa hoàn tất
Tác vụ trình duyệt
Trạng thái tạm thời không khả dụng
Xác nhận hủy xuất bản
và {count} mục khác
Sửa quy trình
Đã xóa ghi chú trang web.
Địa chỉ web
Tính chi phí tham khảo
Hãy mở hoặc khôi phục trình duyệt này trước. Chờ trình duyệt chạy rồi mới bắt đầu hướng dẫn.
Hãy kiểm tra tên và các bước của quy trình. Mỗi bước cần trang web hoặc phần tử trang hợp lệ. Mật khẩu và khóa chỉ được dùng tham chiếu kho bảo mật.
Chi phí: chưa rõ
Chưa ghi được bước nào để lưu. Hãy mở trình duyệt và làm mẫu trước, sau đó dừng và lưu.
Bước này chỉ lưu tham chiếu kho bảo mật. Thành phần riêng sẽ nhập thông tin xác thực; quy trình không hiển thị mật khẩu.
Bản ghi này không còn tồn tại. Hãy làm mới rồi thử lại.
Sau khi kết nối, áp dụng quy tắc cấp quyền, thao tác và tính phí của màn hình từ xa.
Trạng thái kết nối dựa trên kiểm tra dịch vụ thực tế. Lưu lựa chọn không có nghĩa là đã kết nối. Phí được tính theo giá vốn, không cộng thêm.
Chọn một trình duyệt đang chạy. Bắt đầu hướng dẫn, mở trình duyệt, tiếp quản và làm mẫu, rồi dừng và lưu. Mật khẩu và khóa chỉ được lưu dưới dạng tham chiếu kho bảo mật.
Tác vụ cấu hình
Kết quả gửi cấu hình chưa được xác nhận. Hãy làm mới trạng thái trước khi gửi lại.
Liên kết không hợp lệ
Phần tử trang được tìm bằng tên, nhãn hoặc dấu trang. Tham chiếu kho bảo mật được giữ lại; không hỗ trợ tập lệnh tại đây.
Không khởi động được bản xem trước
Kết quả đổi nguồn bản xem trước chưa được xác nhận. Hãy làm mới rồi thử lại.
Lựa chọn mặc định`.split("\n");

const tr = `{done}/{total} adım
Sonraki dosya
Kaynak kodu ZIP olarak indir
Farklı görevler aynı anda kendi tarayıcılarını kullanabilir. Bir akışı izlemek veya göstermek için görev seçin.
Bunlar kaynaklar için referans fiyatlardır; tarayıcının gerçek ücretlendirmesi henüz doğrulanmadı.
Projeyi yayımla
Proje görünümü
Proje yapılandırması
Tarayıcının kontrolünü devralıyorsunuz. Parolaları ve ödeme bilgilerini kendiniz girin. Hassas veri girişi sırasında ekran yakalama ve kayıt duraklatılır.
Proje yapılandırmasındaki barındırılan arka uç kimlik doğrulama hizmetini kullan.
Bu sitenin girişini sonraki kullanım için kaydedin. Ayarlardan site kayıtlarını inceleyebilir, girişleri silebilir veya kaydetmeyi kapatabilirsiniz.
Girişi kaydet
Yayımlanan projeyi durdur
İçerik denetimleri geçemedi. Düzenleyip yeniden deneyin.
Silinemedi. Yeniden deneyin.
Yapılandırma durumunu yenile
Dosya başına üst sınır: {size}
İşaret etmeyi iptal et
Yalnızca bu sefer
Başlatılıyor…
Görsel okunamadı
Senaryo planı
Toplam maliyet henüz doğrulanmadı. Fiyatı olmayan kalemler bilinmiyor olarak kalır.
Kapasite bilinmiyor
Henüz ücret kaynağı yok
Henüz arayüz tanımlanmadı
Kaydedilen akışlar ve site notları
Kullanılan veya ayrılan tarayıcı yuvası: {count}
Bir uzak masaüstü zaten kullanılıyor. Önce onu kapatın.
Kütüphanedeki dosya: {name}
Öğretmeye başla
Her hizmet ayrı seçilebilir. Seçimler uygulandığında agent taşıma veya dağıtım görevleri oluşturur.
Agent'a bir konum göster
Oluşturmak istediğiniz projeyi anlatın
Çok sık işlem yapılıyor veya tarayıcı yuvaları dolu. Daha sonra yeniden deneyin.
İzleme görünümünü daralt
Öğretme durduruldu. Akış kaydedildi.
Veritabanı yapılandırması değişti veya şu anda doğrulanamıyor. Yeniden indirin.
Dosya mevcut alan veya boyut sınırını aşıyor.
Plan hizmetleri doldurur. Daha sonra her birini değiştirebilirsiniz.
Düz metin (parola veya anahtar girmeyin)
Henüz site notu yok
Sunucu listesi şu anda okunamıyor.
Doğrulanmamış yapılandırma değişiklikleri var. Yeniden göndermeden önce durumu yenileyin veya görevi inceleyin.
Sunucu doğrulanabilir bir sonuç döndürmedi. Yenileyip yeniden deneyin.
Tarayıcının girişi ve izinleri güncellenemedi. Yeniden deneyin.
Gösterge panelini aç
Standart arayüz
Kaynak dosyalar hazırlanıyor…
Seçimleriniz gönderiliyor…
Kayıt onayı isteniyor…
Tarayıcı görevleri okunuyor…
Bu işlem siteye bilgi gönderir ve geri alınamayabilir.
Bu tarayıcı bir göreve bağlı olmadığından görev bazında yetkilendirilemez.
Sunucu sonucu alınamadı. Yeniden denemeye karar vermeden önce durumu doğrulamak için yenileyin.
Akış ve site notları kaydedildi.
Akış henüz bitmedi. İlgili tarayıcıdaki mevcut sayfayı kontrol edin.
Akış sıraya alındı, henüz bitmedi
Akış çalışıyor, henüz bitmedi
Tarayıcı görevleri
Durum geçici olarak kullanılamıyor
Yayından kaldırmayı onayla
ve {count} diğer öğe
Akışı düzenle
Site notları temizlendi.
Web adresi
Referans maliyeti hesapla
Önce bu tarayıcıyı açın veya geri yükleyin. Öğretmeye başlamadan önce çalışmasını bekleyin.
Akışın adını ve adımlarını kontrol edin. Her adım geçerli bir web sayfası veya sayfa öğesi gerektirir. Parolalar ve anahtarlar kasa başvurusu kullanmalıdır.
Maliyet: bilinmiyor
Henüz kaydedilebilecek adım kaydı yok. Önce tarayıcıyı açıp işlemleri gösterin, ardından durdurup kaydedin.
Bu adım yalnızca kasa başvurusunu kaydeder. Kimlik bilgilerini ayrı bir bileşen girer; akış parolaları göstermez.
Bu kayıt artık mevcut değil. Yenileyip yeniden deneyin.
Bağlandıktan sonra uzak masaüstünün yetkilendirme, kullanım ve ücretlendirme kuralları geçerlidir.
Bağlantı durumu gerçek hizmet kontrollerinden gelir. Seçimleri kaydetmek bağlantı kurulduğu anlamına gelmez. Ücretler ek bedel olmadan maliyet üzerinden hesaplanır.
Çalışan bir tarayıcı seçin. Öğretmeyi başlatın, tarayıcıyı açın, kontrolü devralıp işlemleri gösterin; ardından durdurup kaydedin. Parolalar ve anahtarlar yalnızca kasa başvurusu olarak kaydedilir.
Yapılandırma görevi
Yapılandırma gönderiminin sonucu henüz doğrulanmadı. Yeniden göndermeden önce durumu yenileyin.
Geçersiz bağlantı
Sayfa öğeleri ad, etiket veya sayfa işaretiyle bulunur. Kasa başvuruları korunur; burada betikler desteklenmez.
Önizleme başlatılamadı
Önizleme kaynağı değişikliği doğrulanmadı. Yenileyip yeniden deneyin.
Varsayılan seçim`.split("\n");

const zhTW = `{done}/{total} 步
下一個檔案
下載原始碼 ZIP
不同任務可以同時使用各自的瀏覽器。選擇一個任務觀看或示範流程。
以上是資源價格基準；瀏覽器實際扣費狀態尚未確認。
作品發布
作品檢視
作品設定
你正在接管瀏覽器。密碼和付款資訊只由你親自輸入；敏感輸入期間會暫停畫面擷取與錄製。
使用作品設定中的託管後端驗證服務。
儲存後，下次可以繼續使用這個網站的登入。你可以在設定中查看網站紀錄、刪除登入或關閉儲存。
儲存登入
停止已發布作品
內容未通過檢查，請修改後重試。
刪除失敗，請重試
重新整理設定狀態
單一檔案上限：{size}
取消指位置
只限這次
啟動中…
圖片讀取失敗
情境方案
完整費用尚未確認，未提供價格的項目維持未知。
容量未知
尚無費率來源
尚未宣告介面
已儲存的流程與網站筆記
已占用或預留的瀏覽器名額：{count}
已有遠端桌面正在使用，請先關閉它。
檔案庫中的檔案：{name}
開始教學
所有服務皆可單獨選擇。套用選擇後，agent 會建立遷移或部署任務。
指位置給 agent
描述你想做的作品
操作過於頻繁或瀏覽器名額已滿，請稍後重試。
收合觀看
教學已停止，流程已儲存。
資料庫設定已變更或暫時無法確認，請重新下載。
檔案超過目前空間或大小限制。
方案會填入各項服務，之後仍可逐項變更。
一般文字（不填寫密碼或金鑰）
暫無網站筆記
暫時無法讀取伺服器清單。
有設定變更尚未確認。請先重新整理狀態或查看任務，勿重複提交。
伺服器未傳回可確認的結果，請重新整理後重試。
未能更新瀏覽器的登入與授權，請重試。
查看儀表板
標準介面
正在準備原始碼檔案…
正在提交你的選擇…
正在請求儲存確認…
正在讀取瀏覽器任務…
此操作會向網站提交資訊，執行後可能無法撤回。
此瀏覽器未綁定任務，無法依任務授權。
未收到伺服器結果。請重新整理以確認狀態，再決定是否重試。
流程及網站筆記已儲存。
流程尚未完成，請在對應瀏覽器檢查目前頁面。
流程已排入佇列，尚未完成
流程正在執行，尚未完成
瀏覽器任務
狀態暫時無法使用
確認取消發布
等 {count} 個項目
編輯流程
網站筆記已清除。
網頁位址
計算費用基準
請先開啟或還原這個瀏覽器，等它執行後再開始教學。
請檢查流程名稱和步驟。每一步都需要有效的網頁或頁面元素，密碼和金鑰只能使用保管庫參照。
費用：未知
尚未錄下可儲存的步驟。請先開啟瀏覽器並示範，再停止並儲存。
這個步驟只儲存保管庫參照。憑證由獨立元件填寫，流程不會顯示密碼。
這筆紀錄已不存在，請重新整理後重試。
連線後使用遠端桌面的授權、操作與計費規則。
連線狀態來自實際服務檢查，儲存選擇不代表已連線。費用按成本計算，不加價。
選一個正在執行的瀏覽器，開始教學後開啟它，接管並示範操作，最後停止並儲存。密碼和金鑰只儲存保管庫參照。
設定任務
設定提交結果尚未確認，請先重新整理狀態，勿重複提交。
連結無效
頁面元素透過名稱、標籤或頁面標記定位。保管庫參照會保留；這裡不支援指令碼。
預覽啟動失敗
預覽來源修改結果尚未確認，請重新整理後重試。
預設選擇`.split("\n");

const ja = `{done}/{total} ステップ
次のファイル
ソースコードを ZIP でダウンロード
別々のタスクで、それぞれのブラウザーを同時に使用できます。操作の確認や実演をするタスクを選んでください。
上記はリソース料金の目安です。ブラウザーの実際の課金状況は未確認です。
作品を公開
作品ビュー
作品設定
ブラウザーの操作を引き継いでいます。パスワードと支払い情報はご自身で入力してください。機密情報の入力中は画面の取得と録画を一時停止します。
作品設定のホスト型バックエンド認証サービスを使用します。
保存すると、次回もこのサイトのログインを利用できます。設定でサイトの記録の確認、ログインの削除、保存の無効化ができます。
ログインを保存
公開済み作品を停止
内容がチェックに通りませんでした。修正して再試行してください。
削除に失敗しました。再試行してください。
設定状況を更新
ファイルごとの上限：{size}
位置の指定をキャンセル
今回のみ
起動中…
画像の読み込みに失敗しました
シナリオプラン
総費用は未確認です。料金が提示されていない項目は不明のままです。
容量不明
料金の参照元はまだありません
インターフェースはまだ宣言されていません
保存済みの手順とサイトメモ
使用中または予約済みのブラウザー枠：{count}
すでにリモートデスクトップが使用されています。先に閉じてください。
ライブラリ内のファイル：{name}
操作の学習を開始
各サービスは個別に選択できます。選択を適用すると、agent が移行またはデプロイのタスクを作成します。
agent に位置を示す
作りたい作品を説明してください
操作が頻繁すぎるか、ブラウザー枠がいっぱいです。しばらくしてから再試行してください。
表示を折りたたむ
学習を停止し、手順を保存しました。
データベース設定が変更されたか、現在確認できません。再度ダウンロードしてください。
現在の空き容量またはサイズの制限を超えています。
プランで各サービスを設定します。後から個別に変更できます。
通常のテキスト（パスワードやキーは入力しないでください）
サイトメモはまだありません
現在、サーバー一覧を読み込めません。
未確認の設定変更があります。再送信せず、先に状況を更新するかタスクを確認してください。
サーバーから確認可能な結果が返りませんでした。更新して再試行してください。
ブラウザーのログインと権限を更新できませんでした。再試行してください。
ダッシュボードを表示
標準インターフェース
ソースファイルを準備中…
選択内容を送信中…
保存の確認を要求中…
ブラウザーのタスクを読み込み中…
この操作はサイトに情報を送信します。実行後に取り消せない場合があります。
このブラウザーにはタスクが紐づいていないため、タスク単位で許可できません。
サーバーの結果を受信していません。更新して状況を確認してから、再試行するか決めてください。
手順とサイトメモを保存しました。
手順はまだ完了していません。対応するブラウザーで現在のページを確認してください。
手順は待機中で、まだ完了していません
手順は実行中で、まだ完了していません
ブラウザーのタスク
状況を一時的に確認できません
公開取り消しを確認
ほか {count} 件
手順を編集
サイトメモを消去しました。
ウェブアドレス
料金の目安を計算
まずこのブラウザーを開くか復元してください。起動してから操作の学習を開始してください。
手順の名前と各ステップを確認してください。各ステップには有効なウェブページまたはページ要素が必要です。パスワードとキーには保管庫への参照のみ使用できます。
費用：不明
保存できるステップがまだ記録されていません。ブラウザーを開いて操作を実演してから、停止して保存してください。
このステップには保管庫への参照のみ保存します。認証情報は別のコンポーネントが入力し、手順にパスワードは表示されません。
この記録はもう存在しません。更新して再試行してください。
接続後はリモートデスクトップの権限、操作、課金のルールが適用されます。
接続状況は実際のサービス確認に基づきます。選択を保存しても接続済みとは限りません。料金は原価で計算し、上乗せしません。
起動中のブラウザーを選びます。学習を開始してからブラウザーを開き、操作を引き継いで実演し、最後に停止して保存してください。パスワードとキーは保管庫への参照のみ保存します。
設定タスク
設定の送信結果は未確認です。再送信せず、先に状況を更新してください。
無効なリンク
ページ要素は名前、ラベル、ページのマーカーで特定します。保管庫への参照は保持されます。ここではスクリプトは使用できません。
プレビューの起動に失敗しました
プレビュー元の変更結果は未確認です。更新して再試行してください。
既定の選択`.split("\n");

const ko = `{done}/{total}단계
다음 파일
소스 코드 ZIP 다운로드
서로 다른 작업이 각자의 브라우저를 동시에 사용할 수 있습니다. 과정을 보거나 시연할 작업을 선택하세요.
위 금액은 리소스 기준 가격이며, 브라우저의 실제 청구 상태는 아직 확인되지 않았습니다.
프로젝트 게시
프로젝트 보기
프로젝트 설정
브라우저 제어권을 넘겨받고 있습니다. 비밀번호와 결제 정보는 직접 입력하세요. 민감한 정보를 입력하는 동안 화면 캡처와 녹화가 일시 중지됩니다.
프로젝트 설정의 호스팅된 백엔드 인증 서비스를 사용합니다.
저장하면 다음에도 이 사이트의 로그인을 사용할 수 있습니다. 설정에서 사이트 기록을 확인하거나 로그인을 삭제하거나 저장을 끌 수 있습니다.
로그인 저장
게시된 프로젝트 중지
콘텐츠가 검사를 통과하지 못했습니다. 수정 후 다시 시도하세요.
삭제하지 못했습니다. 다시 시도하세요.
설정 상태 새로고침
파일당 최대 크기: {size}
위치 지정 취소
이번만 허용
시작 중…
이미지를 읽지 못했습니다
시나리오 계획
전체 비용은 아직 확인되지 않았습니다. 가격이 없는 항목은 알 수 없음으로 유지됩니다.
용량 알 수 없음
요금 출처가 아직 없습니다
선언된 인터페이스가 아직 없습니다
저장된 절차 및 사이트 메모
사용 중이거나 예약된 브라우저 슬롯: {count}
이미 사용 중인 원격 데스크톱이 있습니다. 먼저 닫아 주세요.
라이브러리의 파일: {name}
가르치기 시작
각 서비스를 개별적으로 선택할 수 있습니다. 선택을 적용하면 agent가 마이그레이션 또는 배포 작업을 생성합니다.
agent에게 위치 알려주기
만들고 싶은 프로젝트를 설명하세요
작업이 너무 잦거나 브라우저 슬롯이 가득 찼습니다. 나중에 다시 시도하세요.
보기 접기
가르치기를 중지하고 절차를 저장했습니다.
데이터베이스 설정이 변경되었거나 현재 확인할 수 없습니다. 다시 다운로드하세요.
파일이 현재 공간 또는 크기 제한을 초과합니다.
계획에 따라 서비스가 채워집니다. 이후에도 개별적으로 변경할 수 있습니다.
일반 텍스트(비밀번호나 키를 입력하지 마세요)
사이트 메모가 아직 없습니다
현재 서버 목록을 읽을 수 없습니다.
확인되지 않은 설정 변경이 있습니다. 다시 제출하기 전에 상태를 새로고침하거나 작업을 확인하세요.
서버에서 확인 가능한 결과를 반환하지 않았습니다. 새로고침 후 다시 시도하세요.
브라우저 로그인과 권한을 업데이트하지 못했습니다. 다시 시도하세요.
대시보드 보기
표준 인터페이스
소스 파일 준비 중…
선택 사항 제출 중…
저장 확인 요청 중…
브라우저 작업 읽는 중…
이 작업은 사이트에 정보를 제출하며 실행 후 취소하지 못할 수 있습니다.
이 브라우저는 작업에 연결되지 않아 작업별 권한을 부여할 수 없습니다.
서버 결과를 받지 못했습니다. 새로고침하여 상태를 확인한 후 재시도 여부를 결정하세요.
절차와 사이트 메모를 저장했습니다.
절차가 아직 완료되지 않았습니다. 해당 브라우저에서 현재 페이지를 확인하세요.
절차 대기 중, 아직 완료되지 않음
절차 실행 중, 아직 완료되지 않음
브라우저 작업
상태를 일시적으로 확인할 수 없음
게시 취소 확인
외 {count}개 항목
절차 편집
사이트 메모를 지웠습니다.
웹 주소
기준 비용 계산
먼저 이 브라우저를 열거나 복원하세요. 실행된 후 가르치기를 시작하세요.
절차 이름과 단계를 확인하세요. 각 단계에는 유효한 웹페이지나 페이지 요소가 필요합니다. 비밀번호와 키는 보관함 참조만 사용해야 합니다.
비용: 알 수 없음
저장할 단계가 아직 기록되지 않았습니다. 브라우저를 열고 시연한 다음 중지하고 저장하세요.
이 단계는 보관함 참조만 저장합니다. 별도 구성 요소가 인증 정보를 입력하며, 절차에는 비밀번호가 표시되지 않습니다.
이 기록은 더 이상 존재하지 않습니다. 새로고침 후 다시 시도하세요.
연결 후에는 원격 데스크톱의 권한, 조작 및 요금 규칙이 적용됩니다.
연결 상태는 실제 서비스 확인 결과입니다. 선택을 저장해도 연결된 것은 아닙니다. 비용은 추가 요금 없이 원가로 계산됩니다.
실행 중인 브라우저를 선택하세요. 가르치기를 시작한 후 브라우저를 열고 제어권을 넘겨받아 시연한 다음 중지하고 저장하세요. 비밀번호와 키는 보관함 참조로만 저장됩니다.
설정 작업
설정 제출 결과가 아직 확인되지 않았습니다. 다시 제출하기 전에 상태를 새로고침하세요.
잘못된 링크
페이지 요소는 이름, 레이블 또는 페이지 표시로 찾습니다. 보관함 참조는 유지되며 여기서는 스크립트를 지원하지 않습니다.
미리보기를 시작하지 못했습니다
미리보기 원본 변경 결과가 확인되지 않았습니다. 새로고침 후 다시 시도하세요.
기본 선택`.split("\n");

const ar = `{done}/{total} خطوة
الملف التالي
تنزيل الشفرة المصدرية بصيغة ZIP
يمكن للمهام المختلفة استخدام متصفحاتها الخاصة في الوقت نفسه. اختر مهمة لمشاهدة سير عمل أو توضيحه عمليًا.
هذه أسعار مرجعية للموارد؛ لم يتم تأكيد حالة الفوترة الفعلية للمتصفح بعد.
نشر المشروع
عرض المشروع
إعدادات المشروع
أنت تتولى التحكم في المتصفح. أدخل كلمات المرور ومعلومات الدفع بنفسك. يتوقف التقاط الشاشة وتسجيلها مؤقتًا أثناء إدخال البيانات الحساسة.
استخدام خدمة مصادقة الواجهة الخلفية المستضافة المحددة في إعدادات المشروع.
احفظ تسجيل الدخول لإعادة استخدامه في هذا الموقع لاحقًا. يمكنك مراجعة سجلات المواقع أو حذف تسجيلات الدخول أو إيقاف الحفظ من الإعدادات.
حفظ تسجيل الدخول
إيقاف المشروع المنشور
لم يجتز المحتوى الفحص. عدّله وحاول مجددًا.
تعذر الحذف. حاول مجددًا.
تحديث حالة الإعدادات
الحد الأقصى لكل ملف: {size}
إلغاء تحديد الموضع
لهذه المرة فقط
جارٍ البدء…
تعذرت قراءة الصورة
خطة السيناريو
لم يتم تأكيد التكلفة الكاملة بعد. تبقى البنود التي ليس لها سعر غير معروفة.
السعة غير معروفة
لا يوجد مصدر للأسعار بعد
لم تُعلن أي واجهات بعد
مسارات العمل وملاحظات المواقع المحفوظة
خانات المتصفح المستخدمة أو المحجوزة: {count}
يوجد سطح مكتب بعيد قيد الاستخدام بالفعل. أغلقه أولًا.
ملف في المكتبة: {name}
بدء التعليم
يمكن اختيار كل خدمة على حدة. بعد تطبيق الاختيارات، سينشئ الوكيل مهام ترحيل أو نشر.
تحديد موضع للوكيل
صف المشروع الذي تريد إنشاءه
طلبات كثيرة أو جميع خانات المتصفح مشغولة. حاول لاحقًا.
طي العرض
تم إيقاف التعليم وحفظ سير العمل.
تغيرت إعدادات قاعدة البيانات أو يتعذر التحقق منها حاليًا. نزّلها مجددًا.
يتجاوز الملف حد المساحة أو الحجم الحالي.
ستملأ الخطة الخدمات، ويمكنك تغيير كل منها لاحقًا.
نص عادي (لا تُدخل كلمات مرور أو مفاتيح)
لا توجد ملاحظات للموقع بعد
يتعذر قراءة قائمة الخوادم حاليًا.
هناك تغييرات إعدادات لم تُؤكد. حدّث الحالة أو راجع المهمة قبل الإرسال مجددًا.
لم يُرجع الخادم نتيجة قابلة للتحقق. حدّث وحاول مجددًا.
تعذر تحديث تسجيل الدخول وأذونات المتصفح. حاول مجددًا.
عرض لوحة المعلومات
واجهة قياسية
جارٍ تجهيز ملفات المصدر…
جارٍ إرسال اختياراتك…
جارٍ طلب تأكيد الحفظ…
جارٍ قراءة مهام المتصفح…
يرسل هذا الإجراء معلومات إلى الموقع، وقد يتعذر التراجع عنه بعد التنفيذ.
هذا المتصفح غير مرتبط بمهمة، ولا يمكن منحه تفويضًا على أساس المهمة.
لم تصل نتيجة من الخادم. حدّث لتأكيد الحالة قبل اتخاذ قرار بإعادة المحاولة.
تم حفظ سير العمل وملاحظات الموقع.
لم يكتمل سير العمل. تحقق من الصفحة الحالية في المتصفح المعني.
سير العمل في قائمة الانتظار، ولم يكتمل بعد
سير العمل قيد التشغيل، ولم يكتمل بعد
مهام المتصفح
الحالة غير متاحة مؤقتًا
تأكيد إلغاء النشر
و{count} عناصر أخرى
تعديل سير العمل
تم مسح ملاحظات الموقع.
عنوان الويب
حساب التكلفة المرجعية
افتح هذا المتصفح أو استعده أولًا، وانتظر حتى يعمل قبل بدء التعليم.
تحقق من اسم سير العمل وخطواته. تحتاج كل خطوة إلى صفحة ويب أو عنصر صفحة صالح. يجب استخدام مراجع الخزنة فقط لكلمات المرور والمفاتيح.
التكلفة: غير معروفة
لم تُسجل خطوات يمكن حفظها بعد. افتح المتصفح ووضّح الإجراءات أولًا، ثم أوقف واحفظ.
تحفظ هذه الخطوة مرجع الخزنة فقط. يتولى مكوّن مستقل إدخال بيانات الاعتماد، ولا يعرض سير العمل كلمات المرور.
لم يعد هذا السجل موجودًا. حدّث وحاول مجددًا.
بعد الاتصال، تسري قواعد التفويض والتشغيل والفوترة لسطح المكتب البعيد.
تعتمد حالة الاتصال على فحوص فعلية للخدمة. حفظ الاختيارات لا يعني الاتصال. تُحسب الرسوم بسعر التكلفة دون زيادة.
اختر متصفحًا قيد التشغيل. ابدأ التعليم ثم افتحه وتولَّ التحكم ووضّح الإجراءات، وأخيرًا أوقف واحفظ. لا تُحفظ كلمات المرور والمفاتيح إلا كمراجع إلى الخزنة.
مهمة إعداد
لم تُؤكد نتيجة إرسال الإعدادات. حدّث الحالة قبل الإرسال مجددًا.
رابط غير صالح
تُحدد عناصر الصفحة بالاسم أو التسمية أو علامة الصفحة. تُحفظ مراجع الخزنة؛ ولا تُدعم البرامج النصية هنا.
تعذر بدء المعاينة
لم تُؤكد نتيجة تغيير مصدر المعاينة. حدّث وحاول مجددًا.
الاختيار الافتراضي`.split("\n");

const th = `{done}/{total} ขั้นตอน
ไฟล์ถัดไป
ดาวน์โหลดซอร์สโค้ด ZIP
งานต่าง ๆ สามารถใช้เบราว์เซอร์ของตนเองพร้อมกันได้ เลือกงานเพื่อดูหรือสาธิตขั้นตอนการทำงาน
ข้างต้นคือราคาอ้างอิงของทรัพยากร ยังไม่ได้ยืนยันสถานะการเรียกเก็บเงินจริงของเบราว์เซอร์
เผยแพร่ผลงาน
มุมมองผลงาน
การตั้งค่าผลงาน
คุณกำลังรับช่วงควบคุมเบราว์เซอร์ โปรดป้อนรหัสผ่านและข้อมูลการชำระเงินด้วยตนเอง การจับภาพและบันทึกหน้าจอจะหยุดชั่วคราวระหว่างป้อนข้อมูลสำคัญ
ใช้บริการยืนยันตัวตนของแบ็กเอนด์ที่โฮสต์ไว้ในการตั้งค่าผลงาน
บันทึกเพื่อใช้การเข้าสู่ระบบของเว็บไซต์นี้ในครั้งถัดไป คุณสามารถดูประวัติเว็บไซต์ ลบข้อมูลเข้าสู่ระบบ หรือปิดการบันทึกได้ในการตั้งค่า
บันทึกการเข้าสู่ระบบ
หยุดผลงานที่เผยแพร่แล้ว
เนื้อหาไม่ผ่านการตรวจสอบ โปรดแก้ไขแล้วลองอีกครั้ง
ลบไม่สำเร็จ โปรดลองอีกครั้ง
รีเฟรชสถานะการตั้งค่า
ขนาดสูงสุดต่อไฟล์: {size}
ยกเลิกการชี้ตำแหน่ง
เฉพาะครั้งนี้
กำลังเริ่ม…
อ่านรูปภาพไม่สำเร็จ
แผนตามสถานการณ์
ยังไม่ได้ยืนยันค่าใช้จ่ายทั้งหมด รายการที่ไม่มีราคาจะยังคงไม่ทราบ
ไม่ทราบความจุ
ยังไม่มีแหล่งอัตราค่าบริการ
ยังไม่ได้ประกาศอินเทอร์เฟซ
ขั้นตอนการทำงานและบันทึกเว็บไซต์ที่บันทึกไว้
ช่องเบราว์เซอร์ที่ใช้งานหรือจองไว้: {count}
มีเดสก์ท็อประยะไกลใช้งานอยู่แล้ว โปรดปิดก่อน
ไฟล์ในคลัง: {name}
เริ่มสอน
สามารถเลือกแต่ละบริการแยกกันได้ หลังใช้ตัวเลือกแล้ว agent จะสร้างงานย้ายระบบหรือนำขึ้นใช้งาน
ชี้ตำแหน่งให้ agent
อธิบายผลงานที่คุณต้องการสร้าง
ดำเนินการถี่เกินไปหรือช่องเบราว์เซอร์เต็มแล้ว โปรดลองภายหลัง
ย่อมุมมอง
หยุดสอนและบันทึกขั้นตอนการทำงานแล้ว
การตั้งค่าฐานข้อมูลเปลี่ยนไปหรือยังตรวจสอบไม่ได้ โปรดดาวน์โหลดอีกครั้ง
ไฟล์เกินขีดจำกัดพื้นที่หรือขนาดปัจจุบัน
แผนจะกรอกบริการต่าง ๆ ให้ หลังจากนั้นยังเปลี่ยนทีละรายการได้
ข้อความธรรมดา (ไม่ป้อนรหัสผ่านหรือคีย์)
ยังไม่มีบันทึกเว็บไซต์
ไม่สามารถอ่านรายการเซิร์ฟเวอร์ได้ในขณะนี้
มีการเปลี่ยนการตั้งค่าที่ยังไม่ได้ยืนยัน โปรดรีเฟรชสถานะหรือดูงานก่อนส่งซ้ำ
เซิร์ฟเวอร์ไม่ได้ส่งผลลัพธ์ที่ตรวจสอบได้ โปรดรีเฟรชแล้วลองอีกครั้ง
อัปเดตการเข้าสู่ระบบและสิทธิ์ของเบราว์เซอร์ไม่สำเร็จ โปรดลองอีกครั้ง
ดูแดชบอร์ด
อินเทอร์เฟซมาตรฐาน
กำลังเตรียมไฟล์ซอร์สโค้ด…
กำลังส่งตัวเลือกของคุณ…
กำลังขอคำยืนยันการบันทึก…
กำลังอ่านงานของเบราว์เซอร์…
การดำเนินการนี้จะส่งข้อมูลไปยังเว็บไซต์ และอาจย้อนกลับไม่ได้หลังดำเนินการ
เบราว์เซอร์นี้ไม่ได้ผูกกับงาน จึงไม่สามารถอนุญาตตามงานได้
ไม่ได้รับผลลัพธ์จากเซิร์ฟเวอร์ โปรดรีเฟรชเพื่อยืนยันสถานะก่อนตัดสินใจลองอีกครั้ง
บันทึกขั้นตอนการทำงานและบันทึกเว็บไซต์แล้ว
ขั้นตอนการทำงานยังไม่เสร็จ โปรดตรวจสอบหน้าปัจจุบันในเบราว์เซอร์ที่เกี่ยวข้อง
ขั้นตอนการทำงานอยู่ในคิว ยังไม่เสร็จ
ขั้นตอนการทำงานกำลังทำงาน ยังไม่เสร็จ
งานของเบราว์เซอร์
สถานะไม่พร้อมใช้งานชั่วคราว
ยืนยันยกเลิกการเผยแพร่
และอีก {count} รายการ
แก้ไขขั้นตอนการทำงาน
ล้างบันทึกเว็บไซต์แล้ว
ที่อยู่เว็บ
คำนวณค่าใช้จ่ายอ้างอิง
โปรดเปิดหรือกู้คืนเบราว์เซอร์นี้ก่อน รอให้ทำงานแล้วจึงเริ่มสอน
โปรดตรวจสอบชื่อและขั้นตอนการทำงาน แต่ละขั้นตอนต้องมีหน้าเว็บหรือองค์ประกอบหน้าที่ใช้ได้ รหัสผ่านและคีย์ต้องใช้การอ้างอิงคลังข้อมูลลับเท่านั้น
ค่าใช้จ่าย: ไม่ทราบ
ยังไม่ได้บันทึกขั้นตอนที่สามารถจัดเก็บได้ โปรดเปิดเบราว์เซอร์และสาธิตก่อน จากนั้นหยุดและบันทึก
ขั้นตอนนี้บันทึกเฉพาะการอ้างอิงคลังข้อมูลลับ องค์ประกอบแยกต่างหากจะกรอกข้อมูลรับรอง ขั้นตอนการทำงานจะไม่แสดงรหัสผ่าน
รายการนี้ไม่มีอยู่แล้ว โปรดรีเฟรชแล้วลองอีกครั้ง
หลังเชื่อมต่อ จะใช้กฎการอนุญาต การใช้งาน และการคิดค่าบริการของเดสก์ท็อประยะไกล
สถานะการเชื่อมต่อมาจากการตรวจสอบบริการจริง การบันทึกตัวเลือกไม่ได้หมายความว่าเชื่อมต่อแล้ว คิดค่าบริการตามต้นทุนโดยไม่บวกเพิ่ม
เลือกเบราว์เซอร์ที่กำลังทำงาน เริ่มสอนแล้วเปิดเบราว์เซอร์ รับช่วงควบคุมและสาธิต จากนั้นหยุดและบันทึก รหัสผ่านและคีย์จะบันทึกเป็นการอ้างอิงคลังข้อมูลลับเท่านั้น
งานตั้งค่า
ยังไม่ได้ยืนยันผลการส่งการตั้งค่า โปรดรีเฟรชสถานะก่อนส่งซ้ำ
ลิงก์ไม่ถูกต้อง
ค้นหาองค์ประกอบหน้าด้วยชื่อ ป้ายกำกับ หรือเครื่องหมายบนหน้า การอ้างอิงคลังข้อมูลลับจะยังคงอยู่ ที่นี่ไม่รองรับสคริปต์
เริ่มตัวอย่างไม่สำเร็จ
ยังไม่ได้ยืนยันผลการเปลี่ยนแหล่งที่มาของตัวอย่าง โปรดรีเฟรชแล้วลองอีกครั้ง
ตัวเลือกเริ่มต้น`.split("\n");

const hi = `{done}/{total} चरण
अगली फ़ाइल
सोर्स कोड ZIP डाउनलोड करें
अलग-अलग कार्य एक साथ अपने ब्राउज़र इस्तेमाल कर सकते हैं। प्रक्रिया देखने या उसका प्रदर्शन करने के लिए कोई कार्य चुनें।
ये संसाधनों के संदर्भ मूल्य हैं; ब्राउज़र की वास्तविक बिलिंग स्थिति की पुष्टि अभी नहीं हुई है।
प्रोजेक्ट प्रकाशित करें
प्रोजेक्ट दृश्य
प्रोजेक्ट सेटिंग
आप ब्राउज़र का नियंत्रण ले रहे हैं। पासवर्ड और भुगतान की जानकारी खुद दर्ज करें। संवेदनशील जानकारी दर्ज करते समय स्क्रीन कैप्चर और रिकॉर्डिंग रोक दी जाएगी।
प्रोजेक्ट सेटिंग में दी गई होस्टेड बैकएंड प्रमाणीकरण सेवा का उपयोग करें।
इस वेबसाइट का लॉगिन अगली बार फिर इस्तेमाल करने के लिए सहेजें। सेटिंग में आप वेबसाइट रिकॉर्ड देख सकते हैं, लॉगिन हटा सकते हैं या सहेजना बंद कर सकते हैं।
लॉगिन सहेजें
प्रकाशित प्रोजेक्ट रोकें
सामग्री जाँच में सफल नहीं हुई। बदलाव करके फिर कोशिश करें।
हटाया नहीं जा सका। फिर कोशिश करें।
कॉन्फ़िगरेशन की स्थिति रीफ़्रेश करें
प्रति फ़ाइल अधिकतम आकार: {size}
स्थान बताना रद्द करें
सिर्फ़ इस बार
शुरू हो रहा है…
इमेज पढ़ी नहीं जा सकी
परिदृश्य योजना
पूरी लागत की पुष्टि अभी नहीं हुई है। जिन मदों की कीमत नहीं दी गई है, वे अज्ञात रहेंगी।
क्षमता अज्ञात
अभी दर का कोई स्रोत नहीं है
अभी कोई इंटरफ़ेस घोषित नहीं है
सहेजी गई प्रक्रियाएँ और वेबसाइट नोट्स
इस्तेमाल किए गए या आरक्षित ब्राउज़र स्लॉट: {count}
एक रिमोट डेस्कटॉप पहले से इस्तेमाल हो रहा है। पहले उसे बंद करें।
लाइब्रेरी में फ़ाइल: {name}
सिखाना शुरू करें
हर सेवा को अलग चुना जा सकता है। चुनाव लागू करने पर एजेंट माइग्रेशन या डिप्लॉयमेंट के कार्य बनाएगा।
एजेंट को स्थान दिखाएँ
जिस प्रोजेक्ट को बनाना चाहते हैं उसका वर्णन करें
बहुत अधिक गतिविधियाँ हो रही हैं या ब्राउज़र स्लॉट भरे हुए हैं। बाद में फिर कोशिश करें।
दृश्य समेटें
सिखाना रोक दिया गया और प्रक्रिया सहेज दी गई।
डेटाबेस सेटिंग बदल गई है या अभी उसकी पुष्टि नहीं हो सकती। फिर डाउनलोड करें।
फ़ाइल मौजूदा स्थान या आकार की सीमा से बड़ी है।
योजना सेवाएँ भर देगी। बाद में हर सेवा को अलग से बदल सकते हैं।
सादा टेक्स्ट (पासवर्ड या कुंजियाँ न भरें)
अभी कोई वेबसाइट नोट्स नहीं हैं
अभी सर्वर सूची पढ़ी नहीं जा सकती।
कुछ कॉन्फ़िगरेशन बदलावों की पुष्टि नहीं हुई है। फिर से भेजने से पहले स्थिति रीफ़्रेश करें या कार्य देखें।
सर्वर से पुष्टि करने योग्य नतीजा नहीं मिला। रीफ़्रेश करके फिर कोशिश करें।
ब्राउज़र का लॉगिन और अनुमतियाँ अपडेट नहीं हो सकीं। फिर कोशिश करें।
डैशबोर्ड देखें
मानक इंटरफ़ेस
सोर्स फ़ाइलें तैयार हो रही हैं…
आपके चुनाव भेजे जा रहे हैं…
सहेजने की पुष्टि माँगी जा रही है…
ब्राउज़र कार्य पढ़े जा रहे हैं…
यह कार्रवाई वेबसाइट को जानकारी भेजेगी और इसे करने के बाद वापस लेना संभव नहीं भी हो सकता है।
यह ब्राउज़र किसी कार्य से जुड़ा नहीं है, इसलिए कार्य के आधार पर अनुमति नहीं दी जा सकती।
सर्वर का नतीजा नहीं मिला। दोबारा कोशिश करने का निर्णय लेने से पहले रीफ़्रेश करके स्थिति की पुष्टि करें।
प्रक्रिया और वेबसाइट नोट्स सहेज दिए गए।
प्रक्रिया अभी पूरी नहीं हुई है। संबंधित ब्राउज़र में मौजूदा पेज जाँचें।
प्रक्रिया कतार में है, अभी पूरी नहीं हुई
प्रक्रिया चल रही है, अभी पूरी नहीं हुई
ब्राउज़र कार्य
स्थिति फ़िलहाल उपलब्ध नहीं है
प्रकाशन हटाने की पुष्टि करें
और {count} अन्य मदें
प्रक्रिया संपादित करें
वेबसाइट नोट्स मिटा दिए गए।
वेब पता
संदर्भ लागत की गणना करें
पहले यह ब्राउज़र खोलें या बहाल करें। सिखाना शुरू करने से पहले इसके चलने का इंतज़ार करें।
प्रक्रिया का नाम और चरण जाँचें। हर चरण के लिए मान्य वेब पेज या पेज एलिमेंट ज़रूरी है। पासवर्ड और कुंजियों के लिए केवल वॉल्ट संदर्भ इस्तेमाल करें।
लागत: अज्ञात
सहेजने योग्य कोई चरण अभी रिकॉर्ड नहीं हुआ है। पहले ब्राउज़र खोलकर प्रदर्शन करें, फिर रोकें और सहेजें।
यह चरण केवल वॉल्ट संदर्भ सहेजता है। एक अलग घटक लॉगिन विवरण भरता है; प्रक्रिया पासवर्ड नहीं दिखाती।
यह रिकॉर्ड अब मौजूद नहीं है। रीफ़्रेश करके फिर कोशिश करें।
जुड़ने के बाद रिमोट डेस्कटॉप की अनुमति, संचालन और बिलिंग के नियम लागू होंगे।
कनेक्शन की स्थिति वास्तविक सेवा जाँच से मिलती है। चुनाव सहेजने का अर्थ जुड़ जाना नहीं है। शुल्क लागत के आधार पर है, बिना अतिरिक्त बढ़ोतरी के।
चल रहा ब्राउज़र चुनें। सिखाना शुरू करने के बाद उसे खोलें, नियंत्रण लेकर प्रदर्शन करें, फिर रोकें और सहेजें। पासवर्ड और कुंजियाँ केवल वॉल्ट संदर्भ के रूप में सहेजी जाती हैं।
कॉन्फ़िगरेशन कार्य
कॉन्फ़िगरेशन भेजने के नतीजे की पुष्टि नहीं हुई है। फिर से भेजने से पहले स्थिति रीफ़्रेश करें।
अमान्य लिंक
पेज एलिमेंट नाम, लेबल या पेज चिह्न से खोजे जाते हैं। वॉल्ट संदर्भ रखे जाते हैं; यहाँ स्क्रिप्ट का समर्थन नहीं है।
प्रीव्यू शुरू नहीं हुआ
प्रीव्यू स्रोत में बदलाव के नतीजे की पुष्टि नहीं हुई है। रीफ़्रेश करके फिर कोशिश करें।
डिफ़ॉल्ट चुनाव`.split("\n");

const rows: Record<Locale, readonly string[]> = {
  zh: keys, en, de, es, "es-419": es, fr, it, "pt-BR": ptBR, "pt-PT": pt,
  vi, tr, "zh-TW": zhTW, ja, ko, ar, th, hi,
};

export const UF1_MISSING_COPY_B: Record<Locale, Record<string, string>> = Object.fromEntries(
  Object.entries(rows).map(([locale, values]) => {
    if (values.length !== keys.length) throw new Error(`UF1 copy B: ${locale} row length mismatch`);
    return [locale, Object.fromEntries(keys.map((key, index) => [key, values[index]]))];
  }),
) as Record<Locale, Record<string, string>>;
