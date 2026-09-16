(function () {
  var MAGIC = new Uint8Array([
    110, 209, 210, 184, 240, 105, 71, 124, 161, 147, 176, 203, 72, 148, 189, 109, 178, 243, 213, 20,
    57, 125, 96, 243, 158, 150, 135, 196, 241, 183, 216, 244,
  ]);
  var g = typeof globalThis !== "undefined" ? globalThis : self;
  var Orig = g.WebSocket;
  if (!Orig || Orig.__wispMagic) return;
  function isWispUrl(url) {
    try {
      var path = new URL(url, g.location && g.location.href).pathname;
      return (
        path === "/fairs" ||
        path.indexOf("/fairs/") === 0 ||
        path === "/socket" ||
        path.indexOf("/socket/") === 0 ||
        path === "/wisp" ||
        path.indexOf("/wisp/") === 0 ||
        path === "/ws" ||
        path.indexOf("/ws/") === 0
      );
    } catch (e) {
      return false;
    }
  }
  function sendMagic(ws) {
    if (!ws || ws.__lucideMagicSent) return;
    if (ws.readyState !== Orig.OPEN) return;
    ws.__lucideMagicSent = true;
    origSend.call(ws, MAGIC);
  }
  var origSend = Orig.prototype.send;
  Orig.prototype.send = function () {
    if (this.url && isWispUrl(this.url)) sendMagic(this);
    return origSend.apply(this, arguments);
  };
  class Gate extends Orig {
    constructor(url, protocols) {
      super(url, protocols);
      var href = typeof url === "string" ? url : url && url.href;
      this.addEventListener("open", function () {
        if (href && isWispUrl(href)) sendMagic(this);
      });
    }
  }
  Gate.CONNECTING = Orig.CONNECTING;
  Gate.OPEN = Orig.OPEN;
  Gate.CLOSING = Orig.CLOSING;
  Gate.CLOSED = Orig.CLOSED;
  Gate.__wispMagic = true;
  g.WebSocket = Gate;
})();