"use client";

import type { Config } from "@puckeditor/core";

type SectionProps = {
  id: string;
  heading: string;
  subheading: string;
  body: string;
};

const fields = {
  heading: { type: "text" as const },
  subheading: { type: "text" as const },
  body: { type: "textarea" as const },
};

function Block({
  heading,
  subheading,
  body,
}: SectionProps) {
  return (
    <section className="px-6 py-8">
      {heading ? <h2 className="text-xl font-semibold">{heading}</h2> : null}
      {subheading ? <p className="mt-1 text-sm opacity-80">{subheading}</p> : null}
      {body ? <p className="mt-3 text-sm leading-relaxed">{body}</p> : null}
    </section>
  );
}

export const websitePuckConfig = {
  components: {
    Hero: { fields, render: Block },
    FeatureGrid: { fields, render: Block },
    Section: { fields, render: Block },
    Footer: { fields, render: Block },
  },
} satisfies Config;
