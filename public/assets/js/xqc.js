
import {
    installLucideWispEncryption,
    LUCIDE_WISP_URL
} from "/lucide-wisp.mjs";

const { Controller } = $scramjetController;
const { defaultConfig } = $scramjet;
const EpoxyTransport = self.EpoxyTransport.default;

const urlInput = document.getElementById("urlInput");
const tabsEl = document.getElementById("tabs");
const viewportEl = document.getElementById("viewport");

let scramjet = null;
let activeTabId = null;
let nextTabId = 1;

const tabs = new Map();

function norm(value) {
    const input = value.trim();

    if (!input) return "https://search.brave.com";
    if (/^https?:\/\//i.test(input)) return input;

    if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/|$)/i.test(input)) {
        return "http://" + input;
    }

    const looksLikeDomain =
        /^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(input);

    if (looksLikeDomain) return "https://" + input;

    return "https://search.brave.com/search?q=" +
        encodeURIComponent(input);
}

function getFaviconUrls(url) {
    try {
        const domain = new URL(url).hostname;

        return [
            `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`,
            `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`
        ];
    } catch {
        return [];
    }
}

function setTabFavicon(tab) {
    if (!tab?.favicon || !tab?.placeholder) return;

    const version = ++tab.faviconVersion;

    tab.favicon.onload = null;
    tab.favicon.onerror = null;
    tab.favicon.removeAttribute("src");
    tab.favicon.classList.remove("loaded");
    tab.favicon.hidden = true;
    tab.favicon.style.display = "none";

    if (tab.isNewTab || !tab.url) {
        tab.placeholder.hidden = false;
        tab.placeholder.style.display = "block";
        return;
    }

    const faviconUrls = getFaviconUrls(tab.url);
    let index = 0;

    tab.placeholder.hidden = false;
    tab.placeholder.style.display = "block";

    function tryNextFavicon() {
        if (version !== tab.faviconVersion || tab.isNewTab) return;

        if (index >= faviconUrls.length) {
            tab.favicon.hidden = true;
            tab.favicon.style.display = "none";
            tab.placeholder.hidden = false;
            tab.placeholder.style.display = "block";
            return;
        }

        tab.favicon.src = faviconUrls[index++];
    }

    if (!faviconUrls.length) return;

    tab.favicon.onload = () => {
        if (version !== tab.faviconVersion || tab.isNewTab) return;

        tab.placeholder.hidden = true;
        tab.placeholder.style.display = "none";
        tab.favicon.hidden = false;
        tab.favicon.style.display = "block";
        tab.favicon.classList.add("loaded");
    };

    tab.favicon.onerror = tryNextFavicon;
    tryNextFavicon();
}

function updateTabTitle(tab) {
    if (!tab) return;

    if (tab.isNewTab) {
        tab.titleElement.textContent = "new tab";
        tab.button.title = "new tab";
        return;
    }

    let title = "";

    try {
        title = tab.iframe.contentDocument?.title?.toLowerCase() || "";
    } catch { }

    if (!title) {
        try {
            title = new URL(tab.url).hostname.toLowerCase();
        } catch {
            title = "loading...";
        }
    }

    tab.titleElement.textContent = title;
    tab.button.title = title;
}

function syncAddressBar(tab) {
    if (!tab || activeTabId !== tab.id) return;
    urlInput.value = tab.isNewTab ? "" : tab.url;
}

function clearTabTimer(tab) {
    if (!tab) return;
    clearTimeout(tab.navigationTimer);
    tab.navigationTimer = null;
}

function startNavigationFallback(tab) {
    clearTabTimer(tab);

    tab.navigationTimer = setTimeout(() => {
        if (!tabs.has(tab.id)) return;

        syncAddressBar(tab);
        updateTabTitle(tab);
        setTabFavicon(tab);
    }, 10000);
}

function selectTab(id) {
    const tab = tabs.get(id);
    if (!tab) return;

    activeTabId = id;

    for (const item of tabs.values()) {
        const active = item.id === id;

        item.button.classList.toggle("active", active);
        item.button.setAttribute("aria-selected", String(active));
        item.iframe.classList.toggle("active", active);
        item.page.hidden = !active || !item.isNewTab;
    }

    syncAddressBar(tab);

    if (tab.isNewTab) {
        requestAnimationFrame(() => {
            if (activeTabId === id && tab.isNewTab) {
                tab.searchInput.focus();
            }
        });
    }
}

function closeTab(id) {
    const tab = tabs.get(id);
    if (!tab) return;

    clearTabTimer(tab);
    tab.faviconVersion++;

    tab.button.remove();
    tab.iframe.remove();
    tab.page.remove();

    tabs.delete(id);

    if (activeTabId === id) {
        activeTabId = null;

        const remaining = [...tabs.keys()];

        if (remaining.length) {
            selectTab(remaining[remaining.length - 1]);
        } else {
            createTab();
        }
    }
}

function decodeScramjetUrl(proxyUrl) {
    try {
        const parsed = new URL(proxyUrl);
        const marker = "/~/sj/";
        const markerIndex = parsed.pathname.indexOf(marker);

        if (markerIndex === -1) return null;

        const remainder = parsed.pathname.slice(markerIndex + marker.length);
        const parts = remainder.split("/");

        if (parts.length < 3) return null;

        const encodedDestination = parts.slice(2).join("/");
        const destination = decodeURIComponent(encodedDestination);

        if (!/^https?:\/\//i.test(destination)) return null;

        return destination;
    } catch {
        return null;
    }
}

function createTab() {
    const id = nextTabId++;

    const button = document.createElement("button");
    button.className = "tab";
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");

    const placeholder = document.createElement("img");
    placeholder.className = "tab-placeholder";
    placeholder.src = "/assets/img/globe.png";
    placeholder.alt = "";
    placeholder.draggable = false;

    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.alt = "";
    favicon.hidden = true;
    favicon.draggable = false;

    const titleElement = document.createElement("span");
    titleElement.className = "tab-title";
    titleElement.textContent = "new tab";

    const closeButton = document.createElement("span");
    closeButton.className = "tab-close";
    closeButton.title = "Close tab";
    closeButton.setAttribute("role", "button");
    closeButton.setAttribute("aria-label", "close");
    closeButton.innerHTML = '<i data-lucide="x"></i>';

    button.append(placeholder, favicon, titleElement, closeButton);

    button.addEventListener("click", event => {
        if (!event.target.closest(".tab-close")) selectTab(id);
    });

    closeButton.addEventListener("click", event => {
        event.stopPropagation();
        closeTab(id);
    });

    const iframe = document.createElement("iframe");
    iframe.title = "new tab";

    const page = document.createElement("div");
    page.className = "newtab-page";

    const heading = document.createElement("h1");
    heading.className = "newtab-title";
    heading.textContent = "celestial.";

    const form = document.createElement("form");
    form.className = "newtab-search";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "search or enter a URL";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    searchInput.setAttribute("aria-label", "search or enter a URL");

    const searchButton = document.createElement("button");
    searchButton.type = "submit";
    searchButton.setAttribute("aria-label", "search");
    searchButton.innerHTML = '<i data-lucide="search"></i>';

    form.append(searchInput, searchButton);
    page.append(heading, form);

    const shortcuts = document.createElement("div");
    shortcuts.className = "newtab-shortcuts";

    const shortcutItems = [
        {
            name: "playables",
            image: "/assets/img/s.png",
            url: "/-/",
            reversed: true
        },
        {
            name: "movies",
            image: "/assets/img/m.png",
            url: "https://aether.ist/",
            reversed: false
        }
    ];

    shortcutItems.forEach(item => {
        const shortcut = document.createElement("button");
        shortcut.className = "newtab-shortcut";
        shortcut.type = "button";
        shortcut.title = item.name;

        const icon = document.createElement("span");
        icon.className = "shortcut-icon";

        const image = document.createElement("img");
        image.src = item.image;
        image.alt = item.name;
        image.draggable = false;

        const label = document.createElement("span");
        label.className = "shortcut-label";
        label.textContent = item.name;

        icon.appendChild(image);
        shortcut.append(icon, label);

        shortcut.addEventListener("click", () => {
    if (item.reversed) {
        clearTabTimer(tab);
        tab.url = item.url;
        tab.isNewTab = false;
        tab.page.hidden = true;
        updateTabTitle(tab);
        setTabFavicon(tab);
        syncAddressBar(tab);
        tab.frame = null;
        tab.iframe.src = item.url;
    } else {
        navigateTab(tab, item.url);
    }
});

        shortcuts.appendChild(shortcut);
    });

    page.appendChild(shortcuts);

    const tab = {
        id,
        button,
        iframe,
        page,
        placeholder,
        favicon,
        titleElement,
        searchInput,
        frame: null,
        url: "",
        isNewTab: true,
        navigationTimer: null,
        faviconVersion: 0
    };

    form.addEventListener("submit", event => {
        event.preventDefault();
        navigateTab(tab, searchInput.value);
    });

    tabsEl.insertBefore(button, document.getElementById("newTab"));
    viewportEl.append(iframe, page);
    tabs.set(id, tab);

    iframe.addEventListener("load", () => {
        clearTabTimer(tab);
        if (!tabs.has(tab.id)) return;

        try {
            const proxyUrl = tab.iframe.contentWindow.location.href;
            const decodedUrl = decodeScramjetUrl(proxyUrl);

            if (decodedUrl) {
                tab.url = decodedUrl;
                tab.isNewTab = false;
            }
        } catch { }

        updateTabTitle(tab);
        setTabFavicon(tab);
        syncAddressBar(tab);
    });

    if (window.lucide) {
        window.lucide.createIcons({ root: button });
        window.lucide.createIcons({ root: page });
    }

    setTabFavicon(tab);
    updateTabTitle(tab);
    selectTab(id);

    return tab;
}

async function navigateTab(tab, value) {
    if (!tab || !value.trim() || !scramjet) return;

    const url = norm(value);

    clearTabTimer(tab);
    tab.url = url;
    tab.isNewTab = false;
    tab.page.hidden = true;

    updateTabTitle(tab);
    setTabFavicon(tab);
    syncAddressBar(tab);

    try {
        if (!tab.frame) {
            tab.frame = scramjet.createFrame(tab.iframe);
        }

        tab.frame.go(url);
        startNavigationFallback(tab);
    } catch (error) {
        console.error("Navigation failed:", error);
        syncAddressBar(tab);
    }
}

window.addEventListener("message", event => {
    const data = event.data;

    if (
        !data ||
        data.type !== "celestial:goUrl" ||
        typeof data.url !== "string"
    ) {
        return;
    }

    const tab = [...tabs.values()].find(
        item => item.iframe.contentWindow === event.source
    );

    if (!tab) return;

    navigateTab(tab, data.url);
});

function go() {
    const tab = tabs.get(activeTabId);
    if (tab) navigateTab(tab, urlInput.value);
}

document.getElementById("goBtn").addEventListener("click", go);
document.getElementById("newTab").addEventListener("click", createTab);

urlInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        go();
    }
});

document.getElementById("backBtn").addEventListener("click", () => {
    const tab = tabs.get(activeTabId);
    if (!tab?.frame?.back) return;

    clearTabTimer(tab);
    tab.frame.back();
    startNavigationFallback(tab);
});

document.getElementById("forwardBtn").addEventListener("click", () => {
    const tab = tabs.get(activeTabId);
    if (!tab?.frame?.forward) return;

    clearTabTimer(tab);
    tab.frame.forward();
    startNavigationFallback(tab);
});

document.getElementById("reloadBtn").addEventListener("click", () => {
    const tab = tabs.get(activeTabId);
    if (!tab) return;

    clearTabTimer(tab);

    if (tab.isNewTab) {
        tab.searchInput.focus();
        return;
    }

    try {
        if (tab.frame?.reload) {
            tab.frame.reload();
            startNavigationFallback(tab);
        } else {
            navigateTab(tab, tab.url);
        }
    } catch (error) {
        console.error("Reload failed:", error);
        syncAddressBar(tab);
    }
});

async function init() {
    try {
        await navigator.serviceWorker.ready;

        const serviceworker =
            navigator.serviceWorker.controller ??
            (await navigator.serviceWorker.ready).active;

        installLucideWispEncryption();

        const transport = new EpoxyTransport({
            wisp: LUCIDE_WISP_URL
        });

        await transport.init();

        scramjet = new Controller({
            serviceworker,
            transport,
            scramjetConfig: defaultConfig
        });

        await scramjet.wait();
        createTab();
    } catch (error) {
        console.error("Celestial initialization failed:", error);
    }
}

if (window.lucide) {
    window.lucide.createIcons();
}

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js")
        .then(init)
        .catch(error => {
            console.error("Service worker registration failed:", error);
        });
} else {
    console.error("Service workers are not supported.");
}
