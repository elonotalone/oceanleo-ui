"use client";

import type { DomainFamily } from "../contracts/domain-family";
import { useUI } from "../i18n/ui/useUI";
import { resolvePublicAssetMedia } from "../lib/asset-delivery";
import { APP_CARD_GRID_CLASS, AppCardShell } from "./app-card-shell";
import type { HomeAssetRef } from "./home-asset-cards-model";

/** Anonymous template catalog rows. Camel-case is the public API contract. */
export interface AppMaterial {
  id: string;
  title: string;
  summary?: string;
  appId?: string;
  app_id?: string;
  appName?: string;
  app_name?: string;
  siteKey?: string;
  site_key?: string;
  artifactType?: string;
  artifact_type?: string;
  previewKey?: string;
  previewMediaUrl?: string;
  previewUrl?: string;
  preview_key?: string;
}

export interface AppMaterialGroup {
  siteKey: string;
  appId: string;
  name: string;
  materials: AppMaterial[];
}

/** Preserve catalog order and reject rows from a different site. */
export function groupAppMaterials(materials: readonly AppMaterial[], siteKey: string, names: Readonly<Record<string, string>> = {}): AppMaterialGroup[] {
  const groups = new Map<string, AppMaterialGroup>();
  const seen = new Set<string>();
  for (const material of materials) {
    const rowSite = material.siteKey || material.site_key;
    const appId = material.appId || material.app_id;
    if (!material.id || !appId || (rowSite && rowSite !== siteKey)) continue;
    const identity = `${appId}:${material.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    let group = groups.get(appId);
    if (!group) {
      group = { siteKey, appId, name: names[appId] || material.appName || material.app_name || appId, materials: [] };
      groups.set(appId, group);
    }
    group.materials.push(material);
  }
  return [...groups.values()];
}

export function materialThumbnail(material: AppMaterial | undefined, family?: DomainFamily): string {
  return resolvePublicAssetMedia(material?.previewKey || material?.preview_key || material?.previewMediaUrl || material?.previewUrl || "", { purpose: "thumb", family });
}

export function AppMaterialsPanel({ group, family, accent = "#4f46e5", onOpenAsset }: {
  group: AppMaterialGroup;
  family?: DomainFamily;
  accent?: string;
  onOpenAsset: (ref: HomeAssetRef) => void;
}) {
  const tt = useUI();
  return (
    <section className="h-full overflow-y-auto p-5" data-app-materials-panel={group.appId} data-materials-site={group.siteKey}>
      <h2 className="mb-4 text-base font-semibold text-stone-800">{group.name} · {tt("素材")}</h2>
      <div className={APP_CARD_GRID_CLASS}>
        {group.materials.map((material) => (
          <div key={material.id} data-app-material={material.id} data-artifact-type={material.artifactType || material.artifact_type}>
            <AppCardShell variant="home" accent={accent}
              app={{ id: material.id, name: material.title, tagline: material.summary, icon: "📄" }}
              image={materialThumbnail(material, family)}
              cardActionLabel={tt("打开素材：{title}", { title: material.title })}
              onCardClick={() => onOpenAsset({ kind: "template", id: material.id })}
              primaryAction={null}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
