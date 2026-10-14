"use client";

import type { ReactElement, ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BAY_CATEGORY_LABEL } from "./bay-listing";
import { BAY_FORM_LABEL_CLASS, BAY_FORM_PAIR_CLASS } from "./form-ui";
import { PublishCategoryPicker, type PublishCategoryId } from "./PublishCategoryPicker";

/** 发帖顶上：左卖/买，右分类。交付方式在交付条款里。 */
export function BayPublishKindPair({
  listing,
  siteCategory,
  disabled,
  subcategory,
}: {
  listing: PublishCategoryId;
  siteCategory?: string;
  onPickListing?: (id: "digital" | "service" | "app" | "lesson" | "other") => void;
  disabled?: boolean;
  subcategory?: ReactNode;
}): ReactElement {
  return (
    <div className={BAY_FORM_PAIR_CLASS} data-bay-publish-top-pair="">
      <PublishCategoryPicker value={listing} siteCategory={siteCategory} disabled={disabled} />
      {subcategory ? (
        <div data-bay-publish-subcategory="">
          <div data-bay-reveal-item="category">{subcategory}</div>
        </div>
      ) : null}
    </div>
  );
}

export function BayPublishSubcategoryLabel(): ReactElement {
  const tt = useUI();
  return <span className={`mb-2 block ${BAY_FORM_LABEL_CLASS}`}>{tt(BAY_CATEGORY_LABEL)}</span>;
}
