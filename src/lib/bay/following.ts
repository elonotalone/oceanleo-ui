import { bayDelete, bayGet, bayPost } from "./http";

export interface BayPersonCard {
  user_id: string;
  username: string | null;
  name: string;
  avatar_url: string | null;
  following: boolean;
  follows_me: boolean;
  blocked: boolean;
}
export interface BayFollowingItem {
  kind: "service" | "demand" | "asset" | "app" | "lesson";
  id: string;
  title: string;
  cover_url: string | null;
  author: BayPersonCard;
  created_at: string;
  href: string;
}
export interface BayFollowingPage { items: BayFollowingItem[]; next_cursor: string | null }
export function getBayFollowing(cursor?: string | null, signal?: AbortSignal): Promise<BayFollowingPage> {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return bayGet(`/v1/bay/following?${query}`, { signal });
}
export function setBayFollowing(userId: string, following: boolean) {
  return following ? bayPost<{ following: boolean }>("/v1/im/follows", { user_id: userId })
    : bayDelete<{ following: boolean }>(`/v1/im/follows/${encodeURIComponent(userId)}`);
}
export async function getBayFollowPerson(userId: string, username: string, signal?: AbortSignal) {
  const result = await bayGet<{ people: BayPersonCard[] }>(`/v1/im/users/search?${new URLSearchParams({ q: username, limit: "20" })}`, { signal });
  return result.people.find((person) => person.user_id === userId) ?? null;
}
