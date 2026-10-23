
"use strict";

(function () {
    function normalizeUrl(value) {
        const input = String(value ?? "").trim();

        if (!input) return null;
        if (/^https?:\/\//i.test(input)) return input;

        if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([/?#]|$)/i.test(input)) {
            return "http://" + input;
        }

        if (/^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?$/i.test(input)) {
            return "https://" + input;
        }

        return "https://search.brave.com/search?q=" + encodeURIComponent(input);
    }

    window.goUrl = function (url) {
        const destination = normalizeUrl(url);
        if (!destination) return;

        if (window.parent !== window) {
            window.parent.postMessage({
                type: "celestial:goUrl",
                url: destination
            }, "*");
            return;
        }

        window.location.href = destination;
    };
})();
