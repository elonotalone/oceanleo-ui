/**
 * three.js FileLoader / GLTFExporter 在 Node 里会 new ProgressEvent、FileReader。
 * 浏览器自带；闸门跑在 Node，必须先垫上，否则往返实测会在进 Loader 之前就炸。
 */
if (typeof globalThis.ProgressEvent === "undefined") {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.lengthComputable = Boolean(init.lengthComputable);
      this.loaded = Number(init.loaded || 0);
      this.total = Number(init.total || 0);
    }
  };
}

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onload = null;
      this.onerror = null;
      this.onloadend = null;
      this.readyState = 0;
    }

    readAsArrayBuffer(blob) {
      this.readyState = 1;
      Promise.resolve()
        .then(() => (blob && typeof blob.arrayBuffer === "function" ? blob.arrayBuffer() : blob))
        .then((buffer) => {
          this.readyState = 2;
          this.result = buffer;
          const event = { target: this, type: "loadend" };
          if (typeof this.onload === "function") this.onload(event);
          if (typeof this.onloadend === "function") this.onloadend(event);
        })
        .catch((error) => {
          this.readyState = 2;
          const event = { target: this, type: "error", error };
          if (typeof this.onerror === "function") this.onerror(event);
          if (typeof this.onloadend === "function") this.onloadend(event);
        });
    }
  };
}
