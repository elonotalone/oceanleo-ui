export interface BayProfilePublicData {
  handle: string;
  display_name: string;
  [key: string]: unknown;
}

export interface BayServicePublicData {
  id: string;
  title: string;
  [key: string]: unknown;
}

export async function fetchBayProfilePublic(_handle: string): Promise<BayProfilePublicData | null> {
  return null;
}

export async function fetchBayServicePublic(_id: string): Promise<BayServicePublicData | null> {
  return null;
}
