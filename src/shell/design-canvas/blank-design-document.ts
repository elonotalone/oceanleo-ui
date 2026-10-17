import {
  DESIGN_DOCUMENT_PROJECT_SCHEMA,
  type DesignDocumentElement,
  type DesignDocumentProject,
} from "../image-editor/design-document-schema";

export function blankDesignDocument(
  title = "本地设计稿 W10",
): DesignDocumentProject {
  const elements: DesignDocumentElement[] = [];
  for (let index = 0; index < 18; index += 1) {
    elements.push({
      id: `rect${index}`,
      type: "rect",
      x: 8 + (index % 6) * 40,
      y: 8 + Math.floor(index / 6) * 40,
      width: 32,
      height: 32,
      z: index,
      fill: "#1F6FEB",
    });
  }
  elements.push({
    id: "title1",
    type: "text",
    x: 48,
    y: 200,
    width: 520,
    height: 48,
    z: 18,
    text: title,
    fontSizePx: 28,
    fill: "#1F2328",
  });
  elements.push({
    id: "oval1",
    type: "ellipse",
    x: 480,
    y: 200,
    width: 80,
    height: 80,
    z: 19,
    fill: "#E5484D",
  });
  return {
    schema: DESIGN_DOCUMENT_PROJECT_SCHEMA,
    version: 1,
    title,
    document: {
      width: 1080,
      height: 1080,
      background: "#FFFFFF",
      elements,
    },
    palette: ["#FFFFFF", "#1F6FEB", "#1F2328"],
    attribution: {
      entries: [
        {
          text: "OceanLeo local design fixture",
          licenseCode: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
      ],
    },
  };
}
