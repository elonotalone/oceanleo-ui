"use client";

/**
 * `vector-editor` viewport.
 *
 * Spec: vector.md §2.1 icon grid, §2.2 illustration grid, §2.3 palette,
 * §2.4 accessibility, §5.1 shapes are independently selectable, §5.4 the stage
 * only ever needs `viewBox` to scale.
 *
 * Shapes are rendered as React SVG elements built from the IR. Nothing is ever
 * injected as markup — no `dangerouslySetInnerHTML`, no `srcdoc`, no iframe —
 * so the viewport adds no new sink on top of the §3.2 sanitizer.
 */

import { useUI } from "../../i18n/ui/useUI";
import { VECTOR_ICON_GRID, VECTOR_PALETTE, type VectorProject, type VectorShape } from "./vector-schema";
import { parsePathAnchors } from "./vector-source";

const SELECTION_STROKE = VECTOR_PALETTE["vec.accent"];
const GUIDE_STROKE = VECTOR_PALETTE["vec.neutral"];

function paintOf(
  project: VectorProject,
  token: string | undefined,
): string | undefined {
  if (!token) return undefined;
  return project.palette.find((entry) => entry.token === token)?.value;
}

function ShapeNode({
  project,
  shape,
  selected,
  onSelect,
}: {
  project: VectorProject;
  shape: VectorShape;
  selected: boolean;
  onSelect: (shapeId: string) => void;
}) {
  const fill = paintOf(project, shape.fillToken);
  const stroke = paintOf(project, shape.strokeToken);
  const common = {
    fill,
    stroke: selected ? SELECTION_STROKE : stroke,
    strokeWidth: shape.strokeWidth,
    strokeLinecap: shape.strokeLinecap,
    strokeLinejoin: shape.strokeLinejoin,
    fillRule: shape.fillRule,
    opacity: shape.opacity,
    transform: shape.transform,
    // §5.1 换图形 / 改锚点 both start from selecting one shape on its own.
    onClick: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onSelect(shape.id);
    },
    style: { cursor: "pointer" as const },
  };
  switch (shape.type) {
    case "path":
      return <path d={shape.d ?? ""} {...common} />;
    case "rect":
      return (
        <rect
          x={shape.x ?? 0}
          y={shape.y ?? 0}
          width={shape.width ?? 0}
          height={shape.height ?? 0}
          rx={shape.rx}
          ry={shape.ry}
          {...common}
        />
      );
    case "circle":
      return (
        <circle cx={shape.cx ?? 0} cy={shape.cy ?? 0} r={shape.r ?? 0} {...common} />
      );
    case "ellipse":
      return (
        <ellipse
          cx={shape.cx ?? 0}
          cy={shape.cy ?? 0}
          rx={shape.rx ?? 0}
          ry={shape.ry ?? 0}
          {...common}
        />
      );
    case "line":
      return (
        <line
          x1={shape.x ?? 0}
          y1={shape.y ?? 0}
          x2={(shape.x ?? 0) + (shape.width ?? 0)}
          y2={(shape.y ?? 0) + (shape.height ?? 0)}
          {...common}
        />
      );
    case "polyline":
      return <polyline points={shape.points ?? ""} {...common} />;
    case "polygon":
      return <polygon points={shape.points ?? ""} {...common} />;
    case "text":
      return (
        <text x={shape.x ?? 0} y={shape.y ?? 0} {...common}>
          {shape.text ?? ""}
        </text>
      );
    case "use":
      return <use href={`#${shape.refId ?? ""}`} {...common} />;
    case "group": {
      const childIds = new Set(shape.childIds ?? []);
      return (
        <g {...common}>
          {project.shapes
            .filter((candidate) => childIds.has(candidate.id))
            .sort((left, right) => left.z - right.z)
            .map((child) => (
              <ShapeNode
                key={child.id}
                project={project}
                shape={child}
                selected={false}
                onSelect={onSelect}
              />
            ))}
        </g>
      );
    }
    default:
      return null;
  }
}

export function VectorStage({
  project,
  selectedShapeId,
  selectedAnchorIndex,
  showGrid = true,
  onSelectShape,
  onSelectAnchor,
}: {
  project: VectorProject | null;
  selectedShapeId: string | null;
  selectedAnchorIndex: number | null;
  showGrid?: boolean;
  onSelectShape: (shapeId: string | null) => void;
  onSelectAnchor: (anchorIndex: number | null) => void;
}) {
  const tt = useUI();
  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-stone-400">
        {tt("尚未载入矢量工程")}
      </div>
    );
  }
  const { viewBoxWidth, viewBoxHeight } = project.canvas;
  const grouped = new Set(project.shapes.flatMap((shape) => shape.childIds ?? []));
  const roots = project.shapes
    .filter((shape) => !grouped.has(shape.id))
    .sort((left, right) => left.z - right.z);
  const selected = project.shapes.find((shape) => shape.id === selectedShapeId);
  const anchors =
    selected?.type === "path" && selected.d ? parsePathAnchors(selected.d) : [];
  const keyline =
    project.canvas.kind === "icon"
      ? VECTOR_ICON_GRID.keylineStepUnits
      : Math.max(1, Math.round(Math.min(viewBoxWidth, viewBoxHeight) / 24));
  const anchorRadius = Math.max(viewBoxWidth, viewBoxHeight) / 90;

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-[#F5F7FA] p-8">
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="max-h-full max-w-full"
        style={{ width: "min(100%, 640px)" }}
        role={project.accessibility.decorative ? "presentation" : "img"}
        aria-label={
          project.accessibility.decorative
            ? undefined
            : project.accessibility.label
        }
        aria-hidden={project.accessibility.decorative || undefined}
        onClick={() => onSelectShape(null)}
      >
        {!project.accessibility.decorative && (
          <title>{project.accessibility.label}</title>
        )}
        {showGrid && (
          <g aria-hidden="true" opacity={0.18}>
            {Array.from(
              { length: Math.floor(viewBoxWidth / keyline) + 1 },
              (_unused, index) => (
                <line
                  key={`v${index}`}
                  x1={index * keyline}
                  y1={0}
                  x2={index * keyline}
                  y2={viewBoxHeight}
                  stroke={GUIDE_STROKE}
                  strokeWidth={keyline / 40}
                />
              ),
            )}
            {Array.from(
              { length: Math.floor(viewBoxHeight / keyline) + 1 },
              (_unused, index) => (
                <line
                  key={`h${index}`}
                  x1={0}
                  y1={index * keyline}
                  x2={viewBoxWidth}
                  y2={index * keyline}
                  stroke={GUIDE_STROKE}
                  strokeWidth={keyline / 40}
                />
              ),
            )}
          </g>
        )}
        {roots.map((shape) => (
          <ShapeNode
            key={shape.id}
            project={project}
            shape={shape}
            selected={shape.id === selectedShapeId}
            onSelect={onSelectShape}
          />
        ))}
        {anchors.map((anchor, index) => (
          <circle
            key={`${anchor.commandIndex}-${index}`}
            cx={anchor.x}
            cy={anchor.y}
            r={index === selectedAnchorIndex ? anchorRadius * 1.5 : anchorRadius}
            fill={
              index === selectedAnchorIndex
                ? SELECTION_STROKE
                : VECTOR_PALETTE["vec.white"]
            }
            stroke={SELECTION_STROKE}
            strokeWidth={anchorRadius / 2}
            style={{ cursor: "pointer" }}
            onClick={(event) => {
              event.stopPropagation();
              onSelectAnchor(index);
            }}
          />
        ))}
      </svg>
    </div>
  );
}
