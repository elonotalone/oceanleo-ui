"use client";

// ============================================================================
// @oceanleo/ui — OceanLeo 企业服务协议（中文草稿，W24）
// ----------------------------------------------------------------------------
// 建团队前必须勾选「我已阅读并同意」这一份。正文是给人读的草稿，标了
// 「草稿，待操作员定稿」；不是法条汇编，所以没有第 X 条编号。
//
// 版本号与 `org-api.ts` 的 `ENTERPRISE_AGREEMENT_VERSION` 同一份字符串
// （`"2026-09-20"`）。网关拒收不等于当前版本的 `agreement_version`。
// 版本只在建团队时核对一次，没有让成员重新同意的流程；改正文不升版本，
// 除非新文字让团队拿到比成员已同意的更多权限（2026-11-18 收窄「团队能看到什么」，未升）。
// ============================================================================

import { ENTERPRISE_AGREEMENT_VERSION } from "../lib/org-api";
import { PageHeader } from "./PageHeader";

export interface OrgAgreementSection {
  id: string;
  title: string;
  body: string;
}

export const ENTERPRISE_AGREEMENT_SECTIONS: readonly OrgAgreementSection[] = [
  {
    id: "scope-and-payer",
    title: "服务范围与付费主体",
    body: "OceanLeo 向团队提供账号、协作、模型调用与相关增值能力。每一次扣费都有明确的付费主体：选「公司付」就从该团队的钱包扣，选个人钱包就从你自己的余额扣。团队负责人可以看清团队钱包花到了哪里；个人钱包的消费不属于团队账单。",
  },
  {
    id: "visibility",
    title: "团队能看到什么",
    body: "团队负责人和管理员只能看到每位成员用团队钱包花了多少钱：总额、按天、按模型，以及给成员设的花费上限。他们看不到任务标题、你和 AI 的对话，也看不到你的文件。内容只在项目里和一起做项目的人共享；你自己发布到团队库的成果，团队里的人也能看到。",
  },
  {
    id: "no-training",
    title: "数据不用于训练",
    body: "你和团队在 OceanLeo 上产生的内容（提示词、生成结果、上传的材料、团队库里的成果）不会被用来训练我们的模型，也不会交给第三方拿去训练。为了提供服务，我们会按你点过的功能把必要的内容发给对应的模型供应商；那一次调用的处理规则以该供应商当时的条款为准。",
  },
  {
    id: "departure-and-offboard",
    title: "成员离开与团队停用时，数据归谁",
    body: "成员离开团队后，用团队钱包完成的任务与已发布到团队库的成果仍留在团队里，离开的人不再能用团队身份打开它们。此人用个人钱包完成的内容仍归此人，团队拿不到。团队被停用或注销后，团队钱包、团队任务与团队库会按当时的保留期限归档或删除；个人钱包与私人任务不受影响。",
  },
  {
    id: "invoice",
    title: "发票与采购",
    body: "境外站点通过 Stripe 收款，付款成功后 Stripe 会出具收据，可在账单页下载。境内站点目前登记对公转账：团队把款打到指定账户并提交转账凭证后，我们按登记金额充入团队钱包，需要发票时按登记的抬头与税号开具。采购订单、框架合同等商务文件不在产品里自动生成，需要时请联系我们的对公渠道。",
  },
  {
    id: "dispute-and-termination",
    title: "争议与终止",
    body: "对某笔扣费有疑问，团队负责人可以在账单与用量里核对，并在合理期限内提出复核。任何一方可以终止企业服务：你这边停用团队或不再续费即可；我们这边若发现滥用、违法或长期欠费，也可以暂停或关闭该团队。终止后，未用完的团队余额按当时公示的退款规则处理，已消耗的模型调用不退。",
  },
];

export interface OrgAgreementProps {
  /** 页头返回。不传时 PageHeader 走 history.back()，没历史则回 /account。 */
  onBack?: () => void;
  className?: string;
}

export function OrgAgreement({ onBack, className = "" }: OrgAgreementProps) {
  return (
    <article className={className} data-org-agreement="1" data-agreement-version={ENTERPRISE_AGREEMENT_VERSION}>
      <PageHeader title="OceanLeo 企业服务协议" onBack={onBack} />
      <p
        className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900"
        data-agreement-draft="1"
      >
        草稿，待操作员定稿。版本 {ENTERPRISE_AGREEMENT_VERSION}。
      </p>
      <div className="mt-6 space-y-6">
        {ENTERPRISE_AGREEMENT_SECTIONS.map((section) => (
          <section key={section.id} data-agreement-section={section.id}>
            <h2 className="text-[15px] font-semibold text-neutral-900">{section.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-700">{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
