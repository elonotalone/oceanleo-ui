// Auth is the identity boundary, not what this test is evaluating. Supplying
// its tiny browser-facing contract avoids booting Supabase's Node/CJS adapters;
// Library/artifact/task/session transports remain the real production modules
// and still traverse the test's global fetch transport.
export const AUTH_STATE_EVENT = "oceanleo:auth-state";
export const PHONE_REQUIRED_EVENT = "oceanleo:phone-required";

export function browserClient() {
  return globalThis.__oneTaskLibrarySupabaseClient ?? null;
}

export async function accessToken() {
  return "one-task-library-test-token";
}

export async function getUserIdSnapshot() {
  return { available: true, userId: "one-task-library-owner" };
}

export async function getUserId() {
  return "one-task-library-owner";
}

export function cachedAccessToken() {
  return "one-task-library-test-token";
}

export async function isSignedIn() {
  return true;
}

export async function getUserEmail() {
  return "acceptance@example.test";
}

export async function getAuthPhoneUser() {
  return null;
}

export function cnPhoneIsBound() {
  return false;
}

export function maskCnPhone() {
  return "";
}

export async function reauthenticate() {
  return {};
}

export async function wechatLoginUrl() {
  return {};
}

export const PASSWORD_RESET_PATH = "/account?reset=1";
export function isPasswordResetLanding() { return false; }
export function passwordResetRedirectTo() { return "https://example.test/account?reset=1"; }
export async function updatePassword() { return {}; }

export async function signOutEverywhere() {}

export function announcePhoneRequired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PHONE_REQUIRED_EVENT));
  }
}

// The UI barrel links auth-dialog/account components even when the Library
// branch never renders them. Keep their import-time surface valid without
// initializing Supabase's SDK machinery in this DOM-only identity fixture.
export const oceanleoConfigured = false;
export async function challengeAndVerify() { return {}; }
export async function currentAal() { return { currentLevel: "aal1", nextLevel: "aal1" }; }
export async function listMfaFactors() { return { factors: [] }; }
export function needsMfaChallenge() { return false; }
export function normalizeCnPhone(value) { return String(value || ""); }
export async function sendPasswordReset() { return {}; }
export async function sendPhoneOtp() { return {}; }
export async function signIn() { return {}; }
export async function signUp() { return {}; }
export async function verifyPhoneOtp() { return {}; }
export async function startOauthSignIn() { return {}; }
export async function enrollTotp() { return {}; }
export async function unenrollFactor() { return {}; }
export async function requestPhoneChange() { return {}; }
export async function verifyPhoneChange() { return {}; }
