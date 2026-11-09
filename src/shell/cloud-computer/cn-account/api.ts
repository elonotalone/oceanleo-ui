"use client";

import { cloudComputerRequest } from "../../../lib/cloud-computer-api";

export type CnCloudAccount = {
  provider: "aliyun";
  role_arn: string;
  external_id: string;
  account_id?: string;
  default_region?: string;
  verified_at?: string | null;
  verified: boolean;
};

export function getCnCloudAccount() {
  return cloudComputerRequest<CnCloudAccount>("/v1/computers/aliyun/account");
}

export function saveCnCloudAccount(body: {
  role_arn: string;
  external_id: string;
  default_region?: string;
}) {
  return cloudComputerRequest<CnCloudAccount>("/v1/computers/aliyun/account", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function verifyCnCloudAccount() {
  return cloudComputerRequest<CnCloudAccount>("/v1/computers/aliyun/account/verify", {
    method: "POST",
  });
}
