export type AccountSessionContactKind = "email" | "phone" | "wechat" | "none";

export type AccountSessionContact = {
  kind: AccountSessionContactKind;
  value: string;
  provider: string;
};

/** Structural match for W1 `AccountProfile`; extra fields are ignored here. */
export type AccountHomeProfile = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  sessionContact: AccountSessionContact;
  identities: unknown[];
  deviceLabels?: Record<string, string>;
};

export type AccountHomeProps = {
  profile: AccountHomeProfile;
  credits?: number | null;
  currency?: string | null;
  onOpenSignInMethods?: () => void;
  onOpenDevices?: () => void;
  onOpenTopup?: () => void;
  onSignedOut?: () => void;
  onProfileChange?: (profile: AccountHomeProfile) => void;
  onDeleteAccount?: () => void | Promise<void>;
};

export const WECHAT_SYNTHETIC_HOST = "wechat.oceanleo.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function avatarInitial(profile: AccountHomeProfile): string {
  const name = (profile.displayName || "").trim();
  if (name) {
    const first = Array.from(name)[0];
    return first ? first.toUpperCase() : "?";
  }
  const contact = sessionContactDisplay(profile.sessionContact);
  if (contact && contact !== "微信" && contact !== "—") {
    const first = Array.from(contact)[0];
    if (first) return first.toUpperCase();
  }
  return "?";
}

export function isWechatSyntheticEmail(value: string): boolean {
  const v = (value || "").trim().toLowerCase();
  if (!v) return false;
  return v.includes(WECHAT_SYNTHETIC_HOST) || /^wx_[a-z0-9]+@/i.test(value);
}

export function sessionContactDisplay(contact: AccountSessionContact | null | undefined): string {
  if (!contact || contact.kind === "none") return "—";
  const value = (contact.value || "").trim();
  if (contact.kind === "wechat") {
    if (!value || isWechatSyntheticEmail(value)) return "微信";
    return value;
  }
  if (contact.kind === "email" && isWechatSyntheticEmail(value)) return "微信";
  return value || "—";
}

export function emailForChangeDialog(contact: AccountSessionContact | null | undefined): string {
  if (!contact) return "";
  const value = (contact.value || "").trim();
  if (contact.kind === "email" && value && !isWechatSyntheticEmail(value)) return value;
  return "";
}

export function isUsableEmail(value: string): boolean {
  return EMAIL_RE.test((value || "").trim());
}

export function trimmedDisplayName(value: string): string {
  return (value || "").trim();
}

export function isAvatarImageFile(file: { type?: string; name?: string } | null | undefined): boolean {
  if (!file) return false;
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("image/") && type !== "image/svg+xml") return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(file.name || ""));
}

const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
const AVATAR_EDGE = 192;

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function mimeForAvatar(file: File): string {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("image/") && type !== "image/svg+xml") return type;
  return "image/png";
}

async function readFileAsDataUrl(file: File): Promise<string> {
  const mime = mimeForAvatar(file);
  if (typeof file.arrayBuffer === "function") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength) return `data:${mime};base64,${bytesToBase64(bytes)}`;
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result.startsWith("data:image/")) resolve(result);
      else reject(new Error("not-image"));
    };
    reader.onerror = () => reject(reader.error || new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

function shrinkAvatarDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      resolve(dataUrl);
      return;
    }
    let settled = false;
    const finish = (url: string) => {
      if (settled) return;
      settled = true;
      resolve(url);
    };
    const timer = setTimeout(() => finish(dataUrl), 80);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_EDGE;
        canvas.height = AVATAR_EDGE;
        const context = canvas.getContext("2d");
        if (!context) {
          finish(dataUrl);
          return;
        }
        const side = Math.min(image.width || AVATAR_EDGE, image.height || AVATAR_EDGE);
        const sx = Math.max(0, ((image.width || side) - side) / 2);
        const sy = Math.max(0, ((image.height || side) - side) / 2);
        context.drawImage(image, sx, sy, side, side, 0, 0, AVATAR_EDGE, AVATAR_EDGE);
        finish(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        finish(dataUrl);
      } finally {
        clearTimeout(timer);
      }
    };
    image.onerror = () => {
      clearTimeout(timer);
      finish(dataUrl);
    };
    image.src = dataUrl;
  });
}

export async function fileToAvatarDataUrl(file: File): Promise<{ url?: string; error?: string }> {
  if (!isAvatarImageFile(file)) return { error: "请选择图片文件（JPG / PNG）。" };
  if (file.size > AVATAR_MAX_BYTES) return { error: "这个文件太大，送不过去。" };
  try {
    const raw = await readFileAsDataUrl(file);
    return { url: await shrinkAvatarDataUrl(raw) };
  } catch {
    return { error: "请选择图片文件（JPG / PNG）。" };
  }
}

/** W1 失败 `{ error }`；成功可带 `nonce`。这里收成同一形状，避免卡在别人的返回类型上。 */
export function identityCallResult(value: unknown): { error?: string; nonce?: string } {
  if (!value || typeof value !== "object") return {};
  const rec = value as Record<string, unknown>;
  return {
    error: typeof rec.error === "string" && rec.error ? rec.error : undefined,
    nonce: typeof rec.nonce === "string" && rec.nonce ? rec.nonce : undefined,
  };
}
