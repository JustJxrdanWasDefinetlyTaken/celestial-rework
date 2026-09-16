const EPOXY_URL = "https://cdn.jsdelivr.net/npm/@mercuryworkshop/epoxy-tls@2.1.19-1/full/epoxy-bundled.js";
const LIBCURL_URL = "https://cdn.jsdelivr.net/npm/libcurl.js@0.7.4/libcurl_full.mjs";

export class CurlEpoxyTransport {
  constructor({ wisp }) {
    this.wisp = wisp;
    this.client = null;
    this.libcurl = null;
  }

  async init() {
    const [{ libcurl }, epoxy] = await Promise.all([
      import(LIBCURL_URL),
      import(EPOXY_URL),
    ]);

    await libcurl.load_wasm();
    libcurl.set_websocket(this.wisp);
    await epoxy.default();

    const options = new epoxy.EpoxyClientOptions();
    options.wisp_v2 = true;
    this.client = new epoxy.EpoxyClient(this.wisp, options);
    this.libcurl = libcurl;
    this.EpoxyClient = epoxy.EpoxyClient;
    this.EpoxyHandlers = epoxy.EpoxyHandlers;
  }

  async request(url, method, body, headers) {
    if (!this.libcurl) throw new Error("Transport is not initialized");

    return this.libcurl.fetch(url, {
      method,
      body,
      headers,
    });
  }

  connect(url, protocols, requestHeaders, onOpen, onData, onClose, onError) {
    if (!this.client) throw new Error("Transport is not initialized");

    const handlers = new this.EpoxyHandlers(
      () => onOpen("", ""),
      () => onClose(1000, ""),
      onError,
      onData,
    );
    const socketPromise = this.client.connect_websocket(
      handlers,
      url.href,
      protocols || [],
      requestHeaders || {},
    );

    socketPromise.catch(onError);

    return [
      (data) => socketPromise.then((socket) => socket.send(data)),
      (code) => socketPromise.then((socket) => socket.close(code || 1000, "")),
    ];
  }
}
