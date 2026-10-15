"use client";

// 设置里不再放第二张卖家资料表。名字、头像、地址、技能都在「我的主页」那张画布上改。

import { useUI } from "../../../i18n/ui/useUI";
import { BAY_FORM_PRIMARY_BUTTON_CLASS } from "../form/form-ui";
import { requestMinePageEdit } from "../page/mine-page-edit";
import { openBay } from "../shell/bay-state";

export function BaySettingsProfileDoor() {
  const tt = useUI();
  return (
    <section data-bay-settings-profile-door>
      <button
        type="button"
        data-bay-open-my-page
        className={BAY_FORM_PRIMARY_BUTTON_CLASS}
        onClick={() => {
          requestMinePageEdit();
          openBay({ kind: "mine", tab: "page" });
        }}
      >
        {tt("编辑主页")}
      </button>
    </section>
  );
}
