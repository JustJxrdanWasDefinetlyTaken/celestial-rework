/** Lucide AES-GCM wrapper around standard Wisp WebSocket frames. */

export const LUCIDE_WISP_MAGIC = new Uint8Array([
  110, 209, 210, 184, 240, 105, 71, 124, 161, 147, 176, 203, 72, 148, 189, 109,
  178, 243, 213, 20, 57, 125, 96, 243, 158, 150, 135, 196, 241, 183, 216, 244,
]);

export const IV_LENGTH = 12;
export const TAG_LENGTH = 16;

/** Filtered (ad-blocking) Lucide Wisp pool. */
export const LUCIDE_WISP_FILTERED = "wss://celestial.press/wisp/";
/** Unfiltered Lucide Wisp pool. */
export const LUCIDE_WISP_UNFILTERED = "wss://celestial.press/wisp/";
/** Active Wisp endpoint. Swap to LUCIDE_WISP_UNFILTERED for /piers/. */
export const LUCIDE_WISP_URL = LUCIDE_WISP_FILTERED;

export function copyBytes(data) {
  const result = new Uint8Array(data.byteLength);
  result.set(data);
  return result;
}

function pathMatches(pathname, prefix) {
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isLucideWispUrl(url) {
  try {
    const base =
      typeof location !== "undefined" && location.href
        ? location.href
        : "https://localhost/";
    const pathname = new URL(url, base).pathname;
    return pathMatches(pathname, "/fairs/") || pathMatches(pathname, "/piers/");
  } catch {
    return false;
  }
}

export async function deriveLucideWispKey(magic) {
  const digest = await crypto.subtle.digest("SHA-256", copyBytes(magic));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptLucideWispFrame(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertextAndTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, copyBytes(plaintext)),
  );
  const frame = new Uint8Array(IV_LENGTH + ciphertextAndTag.byteLength);
  frame.set(iv, 0);
  frame.set(ciphertextAndTag, IV_LENGTH);
  return frame;
}

export async function decryptLucideWispFrame(key, frame) {
  if (frame.byteLength < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Lucide Wisp frame is too short");
  }
  const iv = copyBytes(frame.subarray(0, IV_LENGTH));
  const ciphertextAndTag = copyBytes(frame.subarray(IV_LENGTH));
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertextAndTag,
  );
}

export async function websocketBytes(data) {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  if (ArrayBuffer.isView(data)) {
    return copyBytes(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  }
  return copyBytes(new Uint8Array(data));
}

export function installLucideWispEncryption() {
  const OriginalWebSocket = globalThis.WebSocket;
  if (!OriginalWebSocket || OriginalWebSocket.__lucideWispEncryptionInstalled) {
    return;
  }

  const keyPromise = deriveLucideWispKey(LUCIDE_WISP_MAGIC);

  class LucideWispWebSocket extends OriginalWebSocket {
    #isLucideWisp = false;
    #magicSent = false;
    #dispatchingPlaintext = false;
    #outboundQueue = Promise.resolve();

    constructor(url, protocols) {
      if (protocols === undefined) {
        super(url);
      } else {
        super(url, protocols);
      }

      const href = typeof url === "string" ? url : url.href;
      this.#isLucideWisp = isLucideWispUrl(href);
      if (!this.#isLucideWisp) return;

      this.addEventListener(
        "message",
        (event) => {
          if (this.#dispatchingPlaintext) return;
          if (typeof event.data === "string") return;
          event.stopImmediatePropagation();
          void (async () => {
            const encrypted = await websocketBytes(event.data);
            const plaintext = await decryptLucideWispFrame(
              await keyPromise,
              encrypted,
            );
            const payload =
              this.binaryType === "blob" ? new Blob([plaintext]) : plaintext;
            this.#dispatchingPlaintext = true;
            this.dispatchEvent(new MessageEvent("message", { data: payload }));
            this.#dispatchingPlaintext = false;
          })().catch(() => this.close());
        },
        true,
      );

      this.addEventListener("open", () => {
        if (this.readyState === OriginalWebSocket.OPEN) {
          this.send(LUCIDE_WISP_MAGIC);
        }
      });
    }

    send(data) {
      if (!this.#isLucideWisp) {
        super.send(data);
        return;
      }
      if (!this.#magicSent) {
        this.#magicSent = true;
        super.send(data);
        return;
      }
      this.#outboundQueue = this.#outboundQueue
        .then(async () => {
          const plaintext = await websocketBytes(data);
          const encrypted = await encryptLucideWispFrame(
            await keyPromise,
            plaintext,
          );
          super.send(encrypted);
        })
        .catch(() => this.close());
    }
  }

  LucideWispWebSocket.__lucideWispEncryptionInstalled = true;
  globalThis.WebSocket = LucideWispWebSocket;
}
