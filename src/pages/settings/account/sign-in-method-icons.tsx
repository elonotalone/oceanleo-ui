"use client";

/** Google / Microsoft / Apple / 微信 / 邮箱 / 手机。标画在 40px 白底圆角里。 */

export type SignInMethodId =
  | "google"
  | "microsoft"
  | "apple"
  | "email"
  | "phone"
  | "wechat";

export function SignInMethodIcon({
  method,
  size = 20,
}: {
  method: SignInMethodId;
  size?: number;
}) {
  if (method === "google") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    );
  }
  if (method === "microsoft") {
    return (
      <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>
    );
  }
  if (method === "apple") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.37 12.23c-.03-3.04 2.48-4.5 2.59-4.57-1.41-2.06-3.61-2.34-4.39-2.37-1.87-.19-3.65 1.1-4.6 1.1-.95 0-2.41-1.07-3.97-1.04-2.04.03-3.92 1.19-4.97 3.01-2.12 3.68-.54 9.13 1.52 12.11 1.01 1.46 2.21 3.1 3.79 3.04 1.52-.06 2.09-.98 3.93-.98 1.84 0 2.36.98 3.97.95 1.64-.03 2.68-1.49 3.68-2.96 1.16-1.69 1.64-3.33 1.67-3.41-.04-.02-3.2-1.23-3.23-4.88zM13.5 3.72c.84-1.02 1.4-2.43 1.25-3.84-1.21.05-2.67.8-3.54 1.82-.78.9-1.46 2.35-1.28 3.74 1.35.1 2.73-.69 3.57-1.72z"
        />
      </svg>
    );
  }
  if (method === "wechat") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#07C160"
          d="M9.5 4C5.36 4 2 6.8 2 10.25c0 1.9 1.05 3.6 2.7 4.72-.08.3-.28 1.05-.32 1.22-.05.22.08.43.3.5.08.03.16.03.24 0l1.72-.86c.5.12 1.02.2 1.56.24.1-.9.5-1.74 1.12-2.46C8.08 12.7 7.3 11.55 7.3 10.25 7.3 7.8 9.7 5.8 12.7 5.8c.18 0 .36 0 .54.02C12.4 4.7 11.05 4 9.5 4zm-2.2 3.7a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9zm4.2 0a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9zM16.2 8.5c-3.55 0-6.4 2.35-6.4 5.25s2.85 5.25 6.4 5.25c.6 0 1.18-.07 1.73-.2l1.35.68a.4.4 0 0 0 .56-.37l-.28-1.05c1.3-.95 2.14-2.4 2.14-4.31 0-2.9-2.85-5.25-6.5-5.25zm-1.7 3.7a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6zm3.5 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z"
        />
      </svg>
    );
  }
  if (method === "phone") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.6 3.8h2.2c.4 0 .8.3.9.7l.6 2.3c.1.4 0 .8-.3 1.1L8.7 9.3a12.2 12.2 0 0 0 6 6l1.4-1.3c.3-.3.7-.4 1.1-.3l2.3.6c.4.1.7.5.7.9v2.2c0 .5-.4.9-.9.9C10.8 18.3 5.7 13.2 5.7 6.7c0-.5.4-.9.9-.9z"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path strokeLinecap="round" d="M4 7.5 12 13l8-5.5" />
    </svg>
  );
}
