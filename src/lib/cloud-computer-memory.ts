/** Browser memory of the signed-in computer list. Not an API client. */

export const COMPUTER_LIST_CACHE_KEY = "oceanleo.computers.list.v1";
export const MOUNTED_COMPUTER_STORAGE_KEY = "oceanleo.cc.mounted";
export const MOUNTED_COMPUTER_NAME_STORAGE_KEY = "oceanleo.cc.mounted.name";

export function forgetRememberedComputers(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(COMPUTER_LIST_CACHE_KEY);
  } catch {
    /* private mode */
  }
  try {
    window.localStorage.removeItem(MOUNTED_COMPUTER_STORAGE_KEY);
    window.localStorage.removeItem(MOUNTED_COMPUTER_NAME_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}
