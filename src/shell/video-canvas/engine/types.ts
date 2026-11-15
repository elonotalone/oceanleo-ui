export interface GalleryHostAdapter {
  /** 读写陈列馆文档（相对 docs/ 根）。抽出的组件一切持久化只走这两个函数。 */
  readDoc(path: string): Promise<string>;
  writeDoc(path: string, content: string): Promise<void>;
  /** 变更订阅：文件被外部（agent）改动时回调；返回取消函数。 */
  watchDoc(path: string, onChange: () => void): () => void;
  /** 站点私有服务（素材选择、网关调用等）的可选注入；未注入时组件必须可渲染、功能诚实降级。 */
  fetchJson?(url: string, init?: RequestInit): Promise<unknown>;
  log(message: string): void;
}
export interface GalleryEditorProps {
  docPath: string;
  host: GalleryHostAdapter;
}

/** Site/host extras. Not part of the gallery contract; ignored when absent. */
export interface GalleryHostExtras {
  onClose?: () => void;
  materialAppId?: string;
  getLastWriteUrl?: () => string;
  exportDoc?: (content: string) => Promise<string>;
  uploadMediaFile?: (file: File) => Promise<{
    id: string;
    url: string;
    title?: string;
    thumb_url?: string;
    artifact_id?: string;
    meta?: Record<string, unknown>;
  }>;
  /** Owner-private staged bytes for one typed workflow commit; never persisted in the project source. */
  stageProjectSnapshot?: (
    sourceFile: File,
    previewFile: File,
    identity: {
      artifactId: string;
      expectedRevisionId: string;
      projectId: string;
      versionId: string;
    },
  ) => Promise<PrivateProjectSnapshotStage>;
}

export interface PrivateStagedBlobDescriptor {
  blobId: string;
  digest: string;
  mediaType: string;
  byteSize: number;
}

export interface PrivateProjectSnapshotStage {
  source: PrivateStagedBlobDescriptor;
  preview: PrivateStagedBlobDescriptor;
}

export function hostExtras(host: GalleryHostAdapter): GalleryHostExtras {
  return host as GalleryHostAdapter & GalleryHostExtras;
}
