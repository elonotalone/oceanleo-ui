export type PublishListingId = "digital" | "service" | "app" | "lesson" | "need";

let pending: PublishListingId | null = null;

export function rememberPublishListing(id: PublishListingId): void {
  pending = id;
}

export function consumePublishListing(): PublishListingId | null {
  const next = pending;
  pending = null;
  return next;
}
