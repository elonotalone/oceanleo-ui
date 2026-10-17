"use client";

import type { Config } from "@puckeditor/core";

/** Puck injects `id` / `puck`; keep fields optional so this is assignable to PuckComponent. */
type BlockFields = {
  heading?: string;
  subheading?: string;
  body?: string;
};

type WebsitePuckComponents = {
  Hero: BlockFields;
  FeatureGrid: BlockFields;
  Section: BlockFields;
  Footer: BlockFields;
};

const fields = {
  heading: { type: "text" as const },
  subheading: { type: "text" as const },
  body: { type: "textarea" as const },
};

function Block({ heading, subheading, body }: BlockFields) {
  return (
    <section className="px-6 py-8">
      {heading ? <h2 className="text-xl font-semibold">{heading}</h2> : null}
      {subheading ? <p className="mt-1 text-sm opacity-80">{subheading}</p> : null}
      {body ? <p className="mt-3 text-sm leading-relaxed">{body}</p> : null}
    </section>
  );
}

export const websitePuckConfig: Config<WebsitePuckComponents> = {
  components: {
    Hero: { fields, render: Block },
    FeatureGrid: { fields, render: Block },
    Section: { fields, render: Block },
    Footer: { fields, render: Block },
  },
};
