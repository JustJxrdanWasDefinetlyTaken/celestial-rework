export const WISP_CLIENT_MAGIC = new Uint8Array([
  0x6e, 0xd1, 0xd2, 0xb8, 0xf0, 0x69, 0x47, 0x7c,
  0xa1, 0x93, 0xb0, 0xcb, 0x48, 0x94, 0xbd, 0x6d,
  0xb2, 0xf3, 0xd5, 0x14, 0x39, 0x7d, 0x60, 0xf3,
  0x9e, 0x96, 0x87, 0xc4, 0xf1, 0xb7, 0xd8, 0xf4,
]);

// Lucide epoxy client_magic_file; must precede Wisp CONTINUE.
const WISP_PATHS = ["/fairs/", "/socket/", "/wisp/", "/ws/", "/piers/"];
const WISP_MAGIC_SENT = new WeakSet();

function isWispUrl(url) {
  if (!url) return false;

  try {
    const pathname = new URL(url, globalThis.location?.href || "http://localhost").pathname;
    return WISP_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
  } catch {
    return false;
  }
}

function markMagicSent(ws) {
  if (ws && typeof ws === "object") {
    WISP_MAGIC_SENT.add(ws);
    ws.__wispClientMagicSent = true;
  }
}

function hasMagicBeenSent(ws) {
  return !!(ws && typeof ws === "object" && (WISP_MAGIC_SENT.has(ws) || ws.__wispClientMagicSent));
}

export function sendWispClientMagic(ws) {
  if (!ws || typeof ws !== "object") return;
  if (typeof ws.send !== "function") return;
  if (!isWispUrl(ws.url || "")) return;
  if (hasMagicBeenSent(ws)) return;

  if (ws.readyState === 1 || ws.readyState === WebSocket.OPEN) {
    ws.send(WISP_CLIENT_MAGIC);
    markMagicSent(ws);
    return;
  }

  const previousOnOpen = ws.onopen;
  ws.onopen = function onOpenHook(event) {
    if (!hasMagicBeenSent(ws)) {
      ws.send(WISP_CLIENT_MAGIC);
      markMagicSent(ws);
    }
    if (typeof previousOnOpen === "function") {
      previousOnOpen.call(this, event);
    }
  };
}

export function installWispClientMagic() {
  if (globalThis.__wispClientMagicInstalled) return;

  const NativeWebSocket = globalThis.WebSocket;
  if (!NativeWebSocket) return;

  const OriginalSend = NativeWebSocket.prototype.send;
  NativeWebSocket.prototype.send = function patchedSend(...args) {
    if (this && this.url && isWispUrl(this.url) && !hasMagicBeenSent(this) && this.readyState === NativeWebSocket.OPEN) {
      OriginalSend.call(this, WISP_CLIENT_MAGIC);
      markMagicSent(this);
    }
    return OriginalSend.apply(this, args);
  };

  function PatchedWebSocket(url, protocols) {
    const href = typeof url === "string" ? url : url && url.href ? url.href : "";
    const ws = new NativeWebSocket(url, protocols);

    if (href && isWispUrl(href)) {
      ws.addEventListener(
        "open",
        function onOpen() {
          if (!hasMagicBeenSent(this)) {
            this.send(WISP_CLIENT_MAGIC);
            markMagicSent(this);
          }
        }.bind(ws),
        { once: true }
      );
    }

    return ws;
  }

  PatchedWebSocket.prototype = NativeWebSocket.prototype;
  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
    PatchedWebSocket[key] = NativeWebSocket[key];
  }
  PatchedWebSocket.__wispMagic = true;

  globalThis.WebSocket = PatchedWebSocket;
  globalThis.__wispClientMagicInstalled = true;
}

export function patchEpoxyTransport(transport) {
  if (!transport || !transport.client || typeof transport.client.connect_websocket !== "function") return;

  const originalConnectWebSocket = transport.client.connect_websocket.bind(transport.client);
  transport.client.connect_websocket = function patchedConnectWebSocket(...args) {
    const socketPromise = originalConnectWebSocket(...args);
    if (socketPromise && typeof socketPromise.then === "function") {
      socketPromise.then((socket) => {
        sendWispClientMagic(socket);
      });
    }
    return socketPromise;
  };
}

installWispClientMagic();
