import {
  cloudBrowserAuthMessage,
  cloudBrowserV2Message,
  type CloudBrowserWireBinding,
} from "../src/shell/cloud-browser-wire.ts";

const ticket = {
  ticket: "one-use-ticket",
  expires_in: 45,
  protocol_version: 2,
  session_id: "session-fixture",
  runtime_id: "runtime-fixture",
  incarnation: 9,
};
const auth = cloudBrowserAuthMessage(ticket, "session-fixture");
if (!auth.binding) throw new Error("fixture did not produce a v2 binding");

const binding: CloudBrowserWireBinding = {
  ...auth.binding,
  connectionId: "connection-fixture",
};
const mutation = {
  tab_id: "tab-fixture",
  lease_id: "lease-fixture",
  lease_epoch: 4,
  client_event_id: "event-fixture",
};
const messages = [
  cloudBrowserV2Message(binding, "control.acquire", {
    holder_kind: "human",
  }),
  cloudBrowserV2Message(binding, "control.renew", {
    lease_id: "lease-fixture",
    lease_epoch: 4,
  }),
  cloudBrowserV2Message(binding, "pointer", {
    ...mutation,
    event: "down",
    nx: 0.25,
    ny: 0.75,
    button: "left",
  }),
  cloudBrowserV2Message(binding, "wheel", {
    ...mutation,
    nx: 0.25,
    ny: 0.75,
    dx: 0,
    dy: 120,
  }),
  cloudBrowserV2Message(binding, "key", {
    ...mutation,
    event: "press",
    key: "Enter",
  }),
  cloudBrowserV2Message(binding, "text.commit", {
    ...mutation,
    composition_id: "composition-fixture",
    text: "中文かな한글🙂",
  }),
  cloudBrowserV2Message(binding, "nav.open", {
    ...mutation,
    url: "https://www.google.com/search?q=oceanleo",
  }),
  cloudBrowserV2Message(binding, "viewport.set", {
    ...mutation,
    width: 1280,
    height: 800,
    dpr: 2,
  }),
  cloudBrowserV2Message(binding, "tab.create", {
    ...mutation,
    url: "https://www.google.com/",
  }),
  cloudBrowserV2Message(binding, "tab.activate", {
    ...mutation,
    tab_id: "tab-second",
  }),
  cloudBrowserV2Message(binding, "tab.close", {
    ...mutation,
    tab_id: "tab-second",
  }),
  cloudBrowserV2Message(binding, "frame.presented", {
    stream_id: "stream-fixture",
    generation: 5,
    tab_id: "tab-fixture",
    sequence: 1,
    painted_at: "2026-07-20T05:00:00.000Z",
  }),
  cloudBrowserV2Message(binding, "history.capture", {
    tab_id: "tab-fixture",
    client_event_id: "history-fixture",
  }),
  cloudBrowserV2Message(binding, "control.release", {
    lease_id: "lease-fixture",
    lease_epoch: 4,
  }),
  cloudBrowserV2Message(binding, "ping", {
    timestamp: 123,
  }),
];

const legacyAuth = cloudBrowserAuthMessage(
  { ticket: "legacy-ticket", expires_in: 45 },
  "session-fixture",
);

process.stdout.write(JSON.stringify({
  auth: auth.message,
  binding,
  messages,
  legacy: {
    auth: legacyAuth.message,
    messages: [
      { t: "takeover" },
      { t: "pointer", event: "down", nx: 0.5, ny: 0.5 },
      { t: "key", event: "char", text: "V1" },
      { t: "release" },
    ],
  },
}));
