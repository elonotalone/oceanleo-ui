// BYOK 设置页文案 —— 西语系（拉丁字母）译文。
// key 的语义与原文见 ./byok-copy-base.ts。

import type { ByokCopyMessages } from "./byok-copy-base";

export const BYOK_COPY_WESTERN = {
  en: {
    storageNotice:
      "Your key is stored on this device’s browser in encrypted form only. OceanLeo’s servers do not keep it. Each call sends it through the OceanLeo gateway to the vendor; the gateway discards it after use and does not log it. You will need to enter it again on another device, and clearing site data will lose it.",
    storageBrowserOnly:
      "Your key is stored on this device’s browser in encrypted form only. OceanLeo’s servers do not keep it.",
    compatBadge: "OpenAI-compatible APIs only",
    endpointUrl: "Endpoint URL",
    pasteVendorKey: "Paste the vendor API key",
    getFromConsole: "Get it from the vendor console →",
    bailianCodingPlan:
      "Bailian Coding Plan keys (starting with sk-sp-) must not be used on an application backend, and cannot be used here.",
    modelName: "Model name",
    probe: "Probe",
    probeFailed: "Could not probe models.",
    modelPlaceholder: "e.g. gpt-4o; leave blank for the vendor default",
    capability: "Capabilities",
    capTools: "Tool calling",
    capVision: "Image input",
    capReasoning: "Reasoning mode",
    toolsHint:
      "With “Tool calling” checked, the key can run agent tasks. If it is unchecked, agents will return a clear error.",
    configuredProviders: "Configured providers",
    providerDefault: "Vendor default",
    gatewayNotEnabled: "The gateway has not enabled BYOK yet. Please try again later.",
    loginToConfigure: "Sign in to configure your own key",
  },
  de: {
    storageNotice:
      "Dein Key wird nur verschlüsselt im Browser dieses Geräts gespeichert. Die Server von OceanLeo behalten ihn nicht. Jeder Aufruf schickt ihn über das OceanLeo-Gateway an den Anbieter; das Gateway verwirft ihn danach und protokolliert ihn nicht. Auf einem anderen Gerät musst du ihn neu eingeben; das Löschen der Website-Daten entfernt ihn.",
    storageBrowserOnly:
      "Dein Key wird nur verschlüsselt im Browser dieses Geräts gespeichert. Die Server von OceanLeo behalten ihn nicht.",
    compatBadge: "Nur OpenAI-kompatible APIs",
    endpointUrl: "Endpunktadresse",
    pasteVendorKey: "Anbieter-API-Key einfügen",
    getFromConsole: "Im Anbieter-Konto holen →",
    bailianCodingPlan:
      "Keys des Bailian Coding Plan (beginnend mit sk-sp-) dürfen nicht im Anwendungshintergrund verwendet werden und hier nicht genutzt werden.",
    modelName: "Modellname",
    probe: "Prüfen",
    probeFailed: "Modelle konnten nicht ermittelt werden.",
    modelPlaceholder: "z. B. gpt-4o; leer lassen für die Vorgabe des Anbieters",
    capability: "Fähigkeiten",
    capTools: "Werkzeugaufruf",
    capVision: "Bildeingabe",
    capReasoning: "Reasoning-Modus",
    toolsHint:
      "Mit aktiviertem „Werkzeugaufruf“ kann der Key Agentenaufgaben ausführen. Ohne Häkchen meldet der Agent einen klaren Fehler.",
    configuredProviders: "Konfigurierte Anbieter",
    providerDefault: "Anbieterstandard",
    gatewayNotEnabled:
      "Das Gateway hat BYOK noch nicht aktiviert. Bitte später erneut versuchen.",
    loginToConfigure: "Melde dich an, um deinen eigenen Key einzurichten",
  },
  es: {
    storageNotice:
      "Tu clave se guarda solo de forma cifrada en el navegador de este dispositivo. Los servidores de OceanLeo no la conservan. Cada llamada la envía por la pasarela de OceanLeo al proveedor; la pasarela la descarta al usarla y no la registra. En otro dispositivo hay que volver a introducirla; borrar los datos del sitio la pierde.",
    storageBrowserOnly:
      "Tu clave se guarda solo de forma cifrada en el navegador de este dispositivo. Los servidores de OceanLeo no la conservan.",
    compatBadge: "Solo APIs compatibles con OpenAI",
    endpointUrl: "Dirección del endpoint",
    pasteVendorKey: "Pega la API Key del proveedor",
    getFromConsole: "Obtenerla en la consola del proveedor →",
    bailianCodingPlan:
      "Las claves del Bailian Coding Plan (que empiezan por sk-sp-) no pueden usarse en el backend de una aplicación ni aquí.",
    modelName: "Nombre del modelo",
    probe: "Detectar",
    probeFailed: "No se pudieron detectar los modelos.",
    modelPlaceholder: "p. ej. gpt-4o; déjalo vacío para el valor del proveedor",
    capability: "Capacidades",
    capTools: "Llamada a herramientas",
    capVision: "Entrada de imagen",
    capReasoning: "Modo de razonamiento",
    toolsHint:
      "Si marcas «Llamada a herramientas», la clave puede usarse en tareas de agente. Si no, el agente devolverá un error claro.",
    configuredProviders: "Proveedores configurados",
    providerDefault: "Valor del proveedor",
    gatewayNotEnabled: "La pasarela aún no ha activado BYOK. Inténtalo más tarde.",
    loginToConfigure: "Inicia sesión para configurar tu propia clave",
  },
  "es-419": {
    storageNotice:
      "Tu clave se guarda solo de forma cifrada en el navegador de este dispositivo. Los servidores de OceanLeo no la conservan. Cada llamada la envía por la pasarela de OceanLeo al proveedor; la pasarela la descarta al usarla y no la registra. En otro dispositivo hay que volver a ingresarla; borrar los datos del sitio la pierde.",
    storageBrowserOnly:
      "Tu clave se guarda solo de forma cifrada en el navegador de este dispositivo. Los servidores de OceanLeo no la conservan.",
    compatBadge: "Solo APIs compatibles con OpenAI",
    endpointUrl: "Dirección del endpoint",
    pasteVendorKey: "Pega la API Key del proveedor",
    getFromConsole: "Obtenerla en la consola del proveedor →",
    bailianCodingPlan:
      "Las claves del Bailian Coding Plan (que empiezan con sk-sp-) no se pueden usar en el backend de una aplicación ni aquí.",
    modelName: "Nombre del modelo",
    probe: "Detectar",
    probeFailed: "No se pudieron detectar los modelos.",
    modelPlaceholder: "p. ej. gpt-4o; déjalo vacío para el valor del proveedor",
    capability: "Capacidades",
    capTools: "Llamada a herramientas",
    capVision: "Entrada de imagen",
    capReasoning: "Modo de razonamiento",
    toolsHint:
      "Si marcas «Llamada a herramientas», la clave puede usarse en tareas de agente. Si no, el agente devolverá un error claro.",
    configuredProviders: "Proveedores configurados",
    providerDefault: "Valor del proveedor",
    gatewayNotEnabled: "La pasarela todavía no habilitó BYOK. Inténtalo más tarde.",
    loginToConfigure: "Inicia sesión para configurar tu propia clave",
  },
  fr: {
    storageNotice:
      "Votre clé n’est stockée sous forme chiffrée que dans le navigateur de cet appareil. Les serveurs d’OceanLeo ne la conservent pas. Chaque appel la transmet via la passerelle OceanLeo au fournisseur ; la passerelle la jette après usage et ne la consigne pas. Sur un autre appareil, il faudra la ressaisir ; effacer les données du site la fera disparaître.",
    storageBrowserOnly:
      "Votre clé n’est stockée sous forme chiffrée que dans le navigateur de cet appareil. Les serveurs d’OceanLeo ne la conservent pas.",
    compatBadge: "API compatibles OpenAI uniquement",
    endpointUrl: "Adresse de l’interface",
    pasteVendorKey: "Collez la clé API du fournisseur",
    getFromConsole: "L’obtenir dans la console du fournisseur →",
    bailianCodingPlan:
      "Les clés Bailian Coding Plan (commençant par sk-sp-) ne doivent pas servir au backend d’une application et ne peuvent pas être utilisées ici.",
    modelName: "Nom du modèle",
    probe: "Détecter",
    probeFailed: "Impossible de détecter les modèles.",
    modelPlaceholder: "ex. gpt-4o ; laissez vide pour la valeur du fournisseur",
    capability: "Capacités",
    capTools: "Appel d’outils",
    capVision: "Entrée d’image",
    capReasoning: "Mode raisonnement",
    toolsHint:
      "Si « Appel d’outils » est coché, la clé peut servir aux tâches d’agent. Sinon, l’agent renverra une erreur claire.",
    configuredProviders: "Fournisseurs configurés",
    providerDefault: "Valeur du fournisseur",
    gatewayNotEnabled:
      "La passerelle n’a pas encore activé BYOK. Réessayez plus tard.",
    loginToConfigure: "Connectez-vous pour configurer votre propre clé",
  },
  it: {
    storageNotice:
      "La tua chiave è salvata solo in forma cifrata nel browser di questo dispositivo. I server di OceanLeo non la conservano. Ogni chiamata la invia tramite il gateway OceanLeo al fornitore; il gateway la scarta dopo l’uso e non la registra. Su un altro dispositivo va reinserita; cancellare i dati del sito la perde.",
    storageBrowserOnly:
      "La tua chiave è salvata solo in forma cifrata nel browser di questo dispositivo. I server di OceanLeo non la conservano.",
    compatBadge: "Solo API compatibili con OpenAI",
    endpointUrl: "Indirizzo dell’endpoint",
    pasteVendorKey: "Incolla l’API Key del fornitore",
    getFromConsole: "Prendila dalla console del fornitore →",
    bailianCodingPlan:
      "Le chiavi Bailian Coding Plan (che iniziano con sk-sp-) non possono essere usate nel backend di un’applicazione né qui.",
    modelName: "Nome del modello",
    probe: "Rileva",
    probeFailed: "Impossibile rilevare i modelli.",
    modelPlaceholder: "es. gpt-4o; lascia vuoto per il valore del fornitore",
    capability: "Capacità",
    capTools: "Chiamata agli strumenti",
    capVision: "Input immagine",
    capReasoning: "Modalità ragionamento",
    toolsHint:
      "Con «Chiamata agli strumenti» selezionata, la chiave può eseguire compiti dell’agente. Se non è selezionata, l’agente segnalerà un errore chiaro.",
    configuredProviders: "Fornitori configurati",
    providerDefault: "Valore del fornitore",
    gatewayNotEnabled: "Il gateway non ha ancora abilitato BYOK. Riprova più tardi.",
    loginToConfigure: "Accedi per configurare la tua chiave",
  },
  "pt-BR": {
    storageNotice:
      "Sua chave fica salva só de forma criptografada no navegador deste dispositivo. Os servidores da OceanLeo não a guardam. Cada chamada a envia pela gateway da OceanLeo ao fornecedor; a gateway descarta depois de usar e não registra. Em outro dispositivo é preciso preencher de novo; limpar os dados do site a apaga.",
    storageBrowserOnly:
      "Sua chave fica salva só de forma criptografada no navegador deste dispositivo. Os servidores da OceanLeo não a guardam.",
    compatBadge: "Somente APIs compatíveis com OpenAI",
    endpointUrl: "Endereço da interface",
    pasteVendorKey: "Cole a API Key do fornecedor",
    getFromConsole: "Obter no console do fornecedor →",
    bailianCodingPlan:
      "Chaves do Bailian Coding Plan (que começam com sk-sp-) não podem ser usadas no backend de um aplicativo nem aqui.",
    modelName: "Nome do modelo",
    probe: "Detectar",
    probeFailed: "Não foi possível detectar os modelos.",
    modelPlaceholder: "ex.: gpt-4o; deixe em branco para o padrão do fornecedor",
    capability: "Capacidades",
    capTools: "Chamada de ferramentas",
    capVision: "Entrada de imagem",
    capReasoning: "Modo de raciocínio",
    toolsHint:
      "Com «Chamada de ferramentas» marcada, a chave pode rodar tarefas de agente. Se não estiver marcada, o agente devolverá um erro claro.",
    configuredProviders: "Fornecedores configurados",
    providerDefault: "Padrão do fornecedor",
    gatewayNotEnabled: "A gateway ainda não ativou o BYOK. Tente de novo mais tarde.",
    loginToConfigure: "Entre para configurar sua própria chave",
  },
  "pt-PT": {
    storageNotice:
      "A tua chave fica guardada apenas de forma encriptada no browser deste dispositivo. Os servidores da OceanLeo não a conservam. Cada chamada envia-a pela gateway da OceanLeo ao fornecedor; a gateway descarta-a depois de usar e não a regista. Noutro dispositivo é preciso voltar a preenchê-la; limpar os dados do sítio perde-a.",
    storageBrowserOnly:
      "A tua chave fica guardada apenas de forma encriptada no browser deste dispositivo. Os servidores da OceanLeo não a conservam.",
    compatBadge: "Apenas APIs compatíveis com OpenAI",
    endpointUrl: "Endereço da interface",
    pasteVendorKey: "Cola a API Key do fornecedor",
    getFromConsole: "Obter na consola do fornecedor →",
    bailianCodingPlan:
      "As chaves do Bailian Coding Plan (que começam por sk-sp-) não podem ser usadas no backend de uma aplicação nem aqui.",
    modelName: "Nome do modelo",
    probe: "Detetar",
    probeFailed: "Não foi possível detetar os modelos.",
    modelPlaceholder: "ex.: gpt-4o; deixa em branco para o valor do fornecedor",
    capability: "Capacidades",
    capTools: "Chamada de ferramentas",
    capVision: "Entrada de imagem",
    capReasoning: "Modo de raciocínio",
    toolsHint:
      "Com «Chamada de ferramentas» assinalada, a chave pode executar tarefas de agente. Se não estiver assinalada, o agente devolve um erro claro.",
    configuredProviders: "Fornecedores configurados",
    providerDefault: "Valor do fornecedor",
    gatewayNotEnabled: "A gateway ainda não ativou o BYOK. Tenta novamente mais tarde.",
    loginToConfigure: "Inicia sessão para configurares a tua própria chave",
  },
  tr: {
    storageNotice:
      "Anahtarın yalnızca bu cihazın tarayıcısında şifreli olarak saklanır. OceanLeo sunucuları onu tutmaz. Her çağrı onu OceanLeo ağ geçidi üzerinden sağlayıcıya gönderir; ağ geçidi kullandıktan sonra atar ve kaydetmez. Başka bir cihazda yeniden girmen gerekir; site verilerini silmek onu kaybettirir.",
    storageBrowserOnly:
      "Anahtarın yalnızca bu cihazın tarayıcısında şifreli olarak saklanır. OceanLeo sunucuları onu tutmaz.",
    compatBadge: "Yalnızca OpenAI uyumlu API’ler",
    endpointUrl: "Uç nokta adresi",
    pasteVendorKey: "Sağlayıcı API Key’ini yapıştır",
    getFromConsole: "Sağlayıcı konsolundan al →",
    bailianCodingPlan:
      "Bailian Coding Plan anahtarları (sk-sp- ile başlayanlar) uygulama arka ucunda kullanılamaz ve burada da kullanılamaz.",
    modelName: "Model adı",
    probe: "Tara",
    probeFailed: "Modeller taranamadı.",
    modelPlaceholder: "ör. gpt-4o; sağlayıcı varsayılanı için boş bırak",
    capability: "Yetenekler",
    capTools: "Araç çağrısı",
    capVision: "Görüntü girişi",
    capReasoning: "Akıl yürütme modu",
    toolsHint:
      "«Araç çağrısı» işaretliyken anahtar ajan görevlerinde kullanılabilir. İşaretli değilse ajan açık bir hata verir.",
    configuredProviders: "Yapılandırılmış sağlayıcılar",
    providerDefault: "Sağlayıcı varsayılanı",
    gatewayNotEnabled: "Ağ geçidi henüz BYOK’u açmadı. Lütfen sonra yeniden dene.",
    loginToConfigure: "Kendi anahtarını yapılandırmak için giriş yap",
  },
} satisfies Record<
  "en" | "de" | "es" | "es-419" | "fr" | "it" | "pt-BR" | "pt-PT" | "tr",
  ByokCopyMessages
>;
