export interface BayPaymentConfig {
  enabled: boolean;
  buyer_ready: boolean;
  seller_ready: boolean;
  currency: string;
}

export async function fetchBayPaymentConfig(): Promise<BayPaymentConfig> {
  return { enabled: false, buyer_ready: false, seller_ready: false, currency: "usd" };
}

export async function startBayPayment(_contractId: string): Promise<{ redirect_url: string | null }> {
  return { redirect_url: null };
}
