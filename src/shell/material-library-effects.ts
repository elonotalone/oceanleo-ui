"use client";

/**
 * Side-effect hooks lifted out of `material-library-view.tsx`: the artifact
 * deep link and the library-change subscription. Both keep their original
 * behaviour; only their home changed.
 */

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  artifactIsVisible,
  type ArtifactContextRef,
  type ArtifactType,
} from "./artifact-contract";
import {
  ARTIFACT_LIBRARY_CHANGE_EVENT,
  getArtifactItem,
} from "./artifact-client";
import { isAdvancedEditableShelfItem } from "./advanced-features";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import { useLibraryEditIntent } from "./library-edit-intent";
import type { WorkspaceActionEnvelope } from "./workspace-actions";
import {
  artifactEntry,
  invalidateMaterialLibraryCache,
  libraryItemHasExactPrimaryContext,
  type MaterialLibraryLevel,
} from "./material-library-controller";
import {
  filterTemplateMaterials,
  listTemplateMaterials,
  templateMaterialEntry,
  templateMaterialEntryId,
  templateMaterialMatchesItemId,
  type TemplateMaterialListing,
} from "./material-library-template-source";
import { materialLibraryHref } from "./material-library-presentation";
import type { WorkspaceLibraryEntry } from "./WorkspaceLibrary";

export function useMaterialLibraryChangeEvents(options: {
  setRemote: Dispatch<SetStateAction<WorkspaceLibraryEntry[]>>;
  setDeepLinkedEntry: Dispatch<SetStateAction<WorkspaceLibraryEntry | null>>;
  setRetryNonce: Dispatch<SetStateAction<number>>;
}): void {
  const { setRemote, setDeepLinkedEntry, setRetryNonce } = options;
  useEffect(() => {
    const refresh = (event: Event) => {
      invalidateMaterialLibraryCache();
      const detail = (event as CustomEvent<{
        action?: string;
        artifactId?: string;
        revisionId?: string;
        favorite?: boolean;
      }>).detail;
      if (
        detail?.action === "favorite" &&
        detail.artifactId &&
        detail.revisionId
      ) {
        const update = (entry: WorkspaceLibraryEntry) => {
          const item = entry.libraryItem;
          if (
            !item ||
            !isDurableLibraryItem(item) ||
            item.artifactId !== detail.artifactId ||
            item.revisionId !== detail.revisionId
          ) {
            return entry;
          }
          const updatedItem: LibraryItem = {
            ...item,
            favorite: detail.favorite === true,
            artifact: {
              ...item.artifact,
              favorite: detail.favorite === true,
            },
          };
          return {
            ...entry,
            libraryItem: updatedItem,
          };
        };
        setRemote((current) => current.map(update));
        setDeepLinkedEntry((current) => (current ? update(current) : null));
        return;
      }
      if (detail?.action === "retire" && detail.artifactId) {
        setRemote((current) =>
          current.filter(
            (entry) =>
              !entry.libraryItem ||
              !isDurableLibraryItem(entry.libraryItem) ||
              entry.libraryItem.artifactId !== detail.artifactId,
          ),
        );
        setDeepLinkedEntry((current) =>
          current?.libraryItem &&
          isDurableLibraryItem(current.libraryItem) &&
          current.libraryItem.artifactId === detail.artifactId
            ? null
            : current,
        );
        return;
      }
      setRetryNonce((value) => value + 1);
    };
    window.addEventListener(ARTIFACT_LIBRARY_CHANGE_EVENT, refresh);
    return () =>
      window.removeEventListener(ARTIFACT_LIBRARY_CHANGE_EVENT, refresh);
  }, [setDeepLinkedEntry, setRemote, setRetryNonce]);
}

interface TemplateMaterialsFetchState {
  materials: TemplateMaterialListing[];
  loading: boolean;
  error: string;
  status?: number;
}

export interface OfficialTemplateShelf extends TemplateMaterialsFetchState {
  /** Shelf-ready cards, deep-linked one first. */
  entries: WorkspaceLibraryEntry[];
  /** Empty unless the deep link named a material this catalog actually has. */
  deepLinkEntryId: string;
}

const NO_TEMPLATE_MATERIALS: TemplateMaterialsFetchState = {
  materials: [],
  loading: false,
  error: "",
};

/**
 * 官方模板目录的读取端。匿名可读，所以未登录用户从首页卡片跳进来时面板里有东西。
 *
 * 只在 `appId` 范围内没命中深链指名的那一份时，才追加一次本站范围的请求：首页卡片
 * 允许跨 app 跳，而「列出本 app 的素材」与「打开被指名的那一份」是两个要求，不能
 * 让后者把前者的范围撑成整站。没有深链时永远只发一次请求。
 */
export function useOfficialTemplateMaterials(options: {
  level: MaterialLibraryLevel;
  siteKey: string;
  appId: string;
  itemId: string;
  types: readonly ArtifactType[];
}): OfficialTemplateShelf {
  const { itemId, level, siteKey, types } = options;
  // 「此 app」按 app 收窄；本站 / 更多两层给整站目录。
  //
  // `"default"` 是宿主在没有 app 会话时的兜底值，不是目录里的 app：拿它去过滤
  // `app_id` 一条都不会命中，货架又变回空的。这种情况按整站目录取。
  const scopedAppId = options.appId === "default" ? "" : options.appId;
  const appId = level === "primary" ? scopedAppId : "";
  const [state, setState] = useState<TemplateMaterialsFetchState>(
    NO_TEMPLATE_MATERIALS,
  );
  useEffect(() => {
    if (!siteKey) {
      setState(NO_TEMPLATE_MATERIALS);
      return;
    }
    const controller = new AbortController();
    const live = () => !controller.signal.aborted;
    setState((current) => ({ ...current, loading: true }));
    void (async () => {
      const scoped = await listTemplateMaterials({
        siteKey,
        appId,
        signal: controller.signal,
      });
      if (!live()) return;
      if (!scoped.ok || !scoped.data) {
        setState({
          materials: [],
          loading: false,
          error: scoped.error || "官方模板素材暂时无法加载。",
          status: scoped.status,
        });
        return;
      }
      let materials = scoped.data;
      const named = Boolean(itemId);
      if (
        named &&
        appId &&
        !materials.some((material) =>
          templateMaterialMatchesItemId(material, itemId),
        )
      ) {
        const site = await listTemplateMaterials({
          siteKey,
          signal: controller.signal,
        });
        if (!live()) return;
        const matched = (site.data || []).filter((material) =>
          templateMaterialMatchesItemId(material, itemId),
        );
        if (matched.length > 0) materials = [...matched, ...materials];
      }
      setState({
        materials,
        loading: false,
        error: "",
        status: scoped.status,
      });
    })();
    return () => controller.abort();
  }, [appId, itemId, siteKey]);

  const typesCsv = types.join(",");
  return useMemo(() => {
    const named = itemId
      ? state.materials.find((material) =>
          templateMaterialMatchesItemId(material, itemId),
        ) || null
      : null;
    const scoped = filterTemplateMaterials(state.materials, {
      appId,
      types: typesCsv ? (typesCsv.split(",") as ArtifactType[]) : [],
    });
    // 被指名的那一份先出场，且不受 app/类型筛选摆布——深链的语义是「打开这一份」。
    const ordered = named
      ? [named, ...scoped.filter((material) => material.id !== named.id)]
      : scoped;
    return {
      ...state,
      entries: ordered.map(templateMaterialEntry),
      deepLinkEntryId: named ? templateMaterialEntryId(named) : "",
    };
  }, [appId, itemId, state, typesCsv]);
}

/**
 * 接口 A §3.2 的消费端：把「预览&编辑」深链指名的那一份交给素材库的只读预览面。
 *
 * 深链的 `item=` 是**裸 artifactId**（接口 A §2），而 `useMaterialLibraryDeepLink`
 * 只认 `artifact:<artifactId>:<revisionId>`，所以那条老路对本链路一律失手。W2 的
 * `useLibraryEditIntent` 才是这条链的时序权威：列表内快路径 → 未命中就按 artifact id
 * 取一次（`auth: "optional"`，匿名可读）→ 取不到走 onFailure，同一 nonce 只消费一次。
 *
 * **必须注册 `onPreviewItem`**：缺席时那个 hook 会退回「只在已加载列表里找」的旧语义，
 * 而官方模板素材本来就不在用户的库里——那正是这条链以前静默失败的方式。
 *
 * 命中即清掉深链错误态：老 hook 已经为同一条 action 报过一次「缺少有效 identity」，
 * 那条报错在这里被证伪了。
 */
export function useMaterialLibraryPreviewIntent(options: {
  action?: WorkspaceActionEnvelope | null;
  entries: readonly WorkspaceLibraryEntry[];
  onOpenItem: (item: LibraryItem) => void;
  setDeepLinkedEntry: Dispatch<SetStateAction<WorkspaceLibraryEntry | null>>;
  setDeepLinkError: Dispatch<SetStateAction<string>>;
  setDeepLinkStatus: Dispatch<SetStateAction<number | undefined>>;
}): void {
  const {
    action,
    entries,
    onOpenItem,
    setDeepLinkError,
    setDeepLinkStatus,
    setDeepLinkedEntry,
  } = options;
  const items = useMemo(
    () =>
      entries
        .map((entry) => entry.libraryItem)
        .filter((item): item is LibraryItem => Boolean(item)),
    [entries],
  );
  useLibraryEditIntent({
    action,
    items,
    onOpenItem,
    onPreviewItem: (item) => {
      setDeepLinkedEntry(artifactEntry(item));
      setDeepLinkError("");
      setDeepLinkStatus(undefined);
    },
    onFailure: (failure) => {
      setDeepLinkedEntry(null);
      setDeepLinkError(
        failure.message || "深链指名的素材暂时打不开，请重试。",
      );
      setDeepLinkStatus(failure.status);
    },
  });
}

export function useMaterialLibraryDeepLink(options: {
  nonce: string | undefined;
  itemId: string;
  query: string;
  level: MaterialLibraryLevel;
  context: ArtifactContextRef;
  taxonomy: ArtifactType | "";
  retryNonce: number;
  setDeepLinkedEntry: Dispatch<SetStateAction<WorkspaceLibraryEntry | null>>;
  setDeepLinkError: Dispatch<SetStateAction<string>>;
  setDeepLinkStatus: Dispatch<SetStateAction<number | undefined>>;
}): void {
  const {
    context,
    itemId,
    level,
    query,
    setDeepLinkError,
    setDeepLinkStatus,
    setDeepLinkedEntry,
    taxonomy,
  } = options;
  useEffect(() => {
    const match = /^artifact:([^:]+):([^:]+)$/.exec(itemId);
    setDeepLinkedEntry(null);
    setDeepLinkError("");
    setDeepLinkStatus(undefined);
    if (!itemId) return;
    if (!match) {
      setDeepLinkError("素材深链缺少有效 artifact/revision identity。");
      setDeepLinkStatus(400);
      return;
    }
    const controller = new AbortController();
    void getArtifactItem(match[1], match[2], controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        const item = result.data;
        const artifact = item?.artifact;
        const trustedItem = Boolean(
          item &&
            artifact &&
            isDurableLibraryItem(item) &&
            artifactIsVisible(artifact) &&
            isAdvancedEditableShelfItem(item),
        );
        const inScope = Boolean(
          result.ok &&
            item &&
            artifact &&
            trustedItem &&
            (!taxonomy || item.artifactType === taxonomy) &&
            (level === "primary"
              ? libraryItemHasExactPrimaryContext(item, context)
              : artifact.owner.visibility === "public" &&
                artifact.roles.includes("template")),
        );
        if (!inScope || !item) {
          setDeepLinkError(
            result.error ||
              "深链 artifact/revision 不属于当前授权范围或 taxonomy。",
          );
          setDeepLinkStatus(result.status || 403);
          return;
        }
        setDeepLinkedEntry({
          ...artifactEntry(item),
          linkUrl: materialLibraryHref({
            query,
            taxonomy,
            item,
          }),
        });
      },
    );
    return () => controller.abort();
  }, [options.nonce, context, level, options.retryNonce, taxonomy]); // eslint-disable-line react-hooks/exhaustive-deps
}
