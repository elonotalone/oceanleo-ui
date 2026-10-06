export type BayFeedKind = "demand" | "service" | "help" | "consult";

export interface BayPrice {
  min_fen: number | null;
  max_fen: number | null;
  unit: string | null;
  currency: string;
}

export interface BayAuthor {
  user_id: string;
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
  verified_level: number;
  rating_avg: number | null;
  rating_count: number;
}

export interface BayFeedItem {
  kind: BayFeedKind;
  id: string;
  title: string;
  summary: string;
  category: string | null;
  created_at: string;
  posted_site: string | null;
  handling_site: string;
  price: BayPrice | null;
  author: BayAuthor;
  stats: { proposal_count?: number; order_count?: number };
  status: string;
  deadline_at: string | null;
  cover_url: string | null;
  has_attached_work: boolean;
}

export interface BayFeedPage {
  items: BayFeedItem[];
  next_cursor: string | null;
}

export interface BayCategory {
  slug: string;
  parent_slug: string | null;
  name_zh: string;
  name_en: string;
  summary: string | null;
  icon: string | null;
  position: number;
  published: boolean;
  catalog_kind: "delivery" | "consult" | null;
  regulated_domain: string | null;
  main_site: string | null;
  profile_count?: number;
  service_count?: number;
  children?: BayCategory[];
}

export interface BayCategoriesResponse {
  items: BayCategory[];
  flat_items: BayCategory[];
  total: number;
  site_defaults: Record<string, string | null>;
}

export interface BayWorkRef {
  kind: "task";
  id: string;
  site_key?: string;
  title?: string;
  preview_url?: string | null;
}

export interface BaySummary {
  needs_action: number;
  items: { proposals: number; orders: number; help: number };
}
