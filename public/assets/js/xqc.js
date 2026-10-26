
import {
    installLucideWispEncryption,
    LUCIDE_WISP_URL
} from "/lucide-wisp.mjs";

const { Controller } = $scramjetController;
const { defaultConfig } = $scramjet;
const EpoxyTransport = self.EpoxyTransport.default;

const urlInput = document.getElementById("urlInput");
const fullscreenbtn = document.getElementById("fullscreenBtn");
const tabsEl = document.getElementById("tabs");
const viewportEl = document.getElementById("viewport");
const reloadBtn = document.getElementById("reloadBtn");
const bookmarkButton = document.getElementById("goBtn");

const BOOKMARKS_KEY = "celestial-bookmarks";

let scramjet = null;
let activeTabId = null;
let nextTabId = 1;
let bookmarks = loadBookmarks();
let bookmarkPanel = null;
let bookmarkHoldTimer = null;
let bookmarkHoldTriggered = false;
let bookmarkDismissHandler = null;
let bookmarkEscapeHandler = null;

const tabs = new Map();

function isPlayablesUrl(value) {
    const input = String(value ?? "").trim();
    return input === "/-/" || input.toLowerCase() === "celestial://playables";
    return input === "/cg/" || input.toLowerCase() === "celestial://playables";
}

function updateReloadButton(tab) {
    const disabled = !tab || isPlayablesUrl(tab.url);
    reloadBtn.disabled = disabled;
    reloadBtn.setAttribute("aria-disabled", String(disabled));
}

function norm(value) {
    const input = value.trim();

    if (isPlayablesUrl(input)) return "celestial://playables";
    if (!input) return "https://search.brave.com";
    if (/^https?:\/\//i.test(input)) return input;

    if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/|$)/i.test(input)) {
        return "http://" + input;
    }

    const looksLikeDomain = /^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(input);

    if (looksLikeDomain) return "https://" + input;

    return "https://search.brave.com/search?q=" + encodeURIComponent(input);
}

function getFaviconUrls(url) {
    try {
        const domain = new URL(url, location.href).hostname;
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

    if (tab.isNewTab || !tab.url || isPlayablesUrl(tab.url)) {
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

    if (isPlayablesUrl(tab.url)) {
        tab.titleElement.textContent = "playables";
        tab.button.title = "playables";
        return;
    }

    let title = "";

    try {
        title = tab.iframe.contentDocument?.title?.toLowerCase() || "";
    } catch {}

    if (!title) {
        try {
            title = new URL(tab.url, location.href).hostname.toLowerCase();
        } catch {
            title = "loading...";
        }
    }

    tab.titleElement.textContent = title;
    tab.button.title = title;
}

function syncAddressBar(tab) {
    if (!tab || activeTabId !== tab.id) return;

    urlInput.value = tab.isNewTab
        ? ""
        : isPlayablesUrl(tab.url)
            ? "celestial://playables"
            : tab.url;

    updateReloadButton(tab);
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
    updateReloadButton(tab);

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

function loadBookmarks() {
    try {
        const saved = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]");

        if (!Array.isArray(saved)) return [];

        return saved.filter(item =>
            item &&
            typeof item.url === "string" &&
            /^https?:\/\//i.test(item.url)
        );
    } catch {
        return [];
    }
}

function saveBookmarks() {
    try {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    } catch (error) {
        console.error("could not save bookmarks:", error);
    }
}

function isBookmarkable(tab) {
    return Boolean(
        tab &&
        !tab.isNewTab &&
        !isPlayablesUrl(tab.url) &&
        /^https?:\/\//i.test(tab.url)
    );
}

function getBookmarkTitle(tab) {
    if (!tab) return "Untitled";

    try {
        const title = tab.iframe.contentDocument?.title?.trim();
        if (title) return title;
    } catch {}

    try {
        return new URL(tab.url).hostname;
    } catch {
        return tab.url || "Untitled";
    }
}

function closeBookmarks() {
    if (bookmarkDismissHandler) {
        document.removeEventListener("pointerdown", bookmarkDismissHandler, true);
        bookmarkDismissHandler = null;
    }

    if (bookmarkEscapeHandler) {
        document.removeEventListener("keydown", bookmarkEscapeHandler);
        bookmarkEscapeHandler = null;
    }

    if (bookmarkPanel) {
        bookmarkPanel.remove();
        bookmarkPanel = null;
    }
}

function addBookmark(tab) {
    if (!isBookmarkable(tab)) {
        showBookmarks();
        return;
    }

    const url = tab.url;

    if (bookmarks.some(item => item.url === url)) {
        showBookmarks();
        return;
    }

    bookmarks.unshift({
        url,
        title: getBookmarkTitle(tab),
        addedAt: Date.now()
    });

    saveBookmarks();
    showBookmarks();
}

function showBookmarks() {
    closeBookmarks();

    const panel = document.createElement("div");
    panel.className = "bookmark-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "bookmarks");

    const header = document.createElement("div");
    header.className = "bookmark-header";

    const heading = document.createElement("span");
    heading.className = "bookmark-heading";
    heading.textContent = "bookmarks";

    const close = document.createElement("button");
    close.className = "bookmark-close";
    close.type = "button";
    close.title = "close bookmarks";
    close.setAttribute("aria-label", "close bookmarks");
    close.innerHTML = '<i data-lucide="x" style="font-size:25px;"></i>';
    close.addEventListener("click", closeBookmarks);

    header.append(heading, close);

    const list = document.createElement("div");
    list.className = "bookmark-list";

    if (bookmarks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "bookmark-empty";
        empty.textContent = "no bookmarks yet.";
        list.appendChild(empty);
    }

    bookmarks.forEach(bookmark => {
        const item = document.createElement("div");
        item.className = "bookmark-item";

        const open = document.createElement("button");
        open.className = "bookmark-open";
        open.type = "button";
        open.title = bookmark.url;

        const title = document.createElement("span");
        title.className = "bookmark-item-title";
        title.textContent = bookmark.title || bookmark.url;

        const url = document.createElement("span");
        url.className = "bookmark-item-url";
        url.textContent = bookmark.url;

        open.append(title, url);

        open.addEventListener("click", () => {
            const tab = tabs.get(activeTabId);
            if (!tab) return;

            closeBookmarks();
            navigateTab(tab, bookmark.url);
        });

        const remove = document.createElement("button");
        remove.className = "bookmark-remove";
        remove.type = "button";
        remove.title = "Remove bookmark";
        remove.setAttribute("aria-label", `Remove ${bookmark.title || bookmark.url}`);
        remove.innerHTML = '<i data-lucide="trash-2"></i>';

        remove.addEventListener("click", () => {
            bookmarks = bookmarks.filter(item => item.url !== bookmark.url);
            saveBookmarks();
            showBookmarks();
        });

        item.append(open, remove);
        list.appendChild(item);
    });

    panel.append(header, list);
    document.body.appendChild(panel);
    bookmarkPanel = panel;

    if (window.lucide) {
        window.lucide.createIcons({ root: panel });
    }

    bookmarkDismissHandler = event => {
        if (
            bookmarkPanel &&
            !bookmarkPanel.contains(event.target) &&
            !bookmarkButton.contains(event.target)
        ) {
            closeBookmarks();
        }
    };

    bookmarkEscapeHandler = event => {
        if (event.key === "Escape") {
            closeBookmarks();
        }
    };

    requestAnimationFrame(() => {
        if (!bookmarkPanel) return;

        document.addEventListener("pointerdown", bookmarkDismissHandler, true);
        document.addEventListener("keydown", bookmarkEscapeHandler);
    });
}

function handleBookmarkClick() {
    const tab = tabs.get(activeTabId);

    if (!isBookmarkable(tab)) {
        showBookmarks();
        return;
    }

    addBookmark(tab);
}

bookmarkButton.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;

    bookmarkHoldTriggered = false;
    clearTimeout(bookmarkHoldTimer);

    bookmarkHoldTimer = setTimeout(() => {
        bookmarkHoldTriggered = true;
        showBookmarks();
    }, 1000);
});

bookmarkButton.addEventListener("pointerup", () => {
    clearTimeout(bookmarkHoldTimer);
});

bookmarkButton.addEventListener("pointerleave", () => {
    clearTimeout(bookmarkHoldTimer);
});

bookmarkButton.addEventListener("pointercancel", () => {
    clearTimeout(bookmarkHoldTimer);
});

bookmarkButton.addEventListener("contextmenu", event => {
    event.preventDefault();
});

bookmarkButton.addEventListener("click", event => {
    if (bookmarkHoldTriggered) {
        bookmarkHoldTriggered = false;
        event.preventDefault();
        return;
    }

    handleBookmarkClick();
});

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
            url: "https://dulo.mov",
            reversed: false
        }
    ];

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
                navigateTab(tab, "celestial://playables");
            } else {
                navigateTab(tab, item.url);
            }
        });

        shortcuts.appendChild(shortcut);
    });

    page.appendChild(shortcuts);

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

        if (isPlayablesUrl(tab.url)) {
            updateTabTitle(tab);
            setTabFavicon(tab);
            syncAddressBar(tab);
            updateReloadButton(tab);
            return;
        }

        try {
            const proxyUrl = tab.iframe.contentWindow.location.href;
            const decodedUrl = decodeScramjetUrl(proxyUrl);

            if (decodedUrl) {
                tab.url = decodedUrl;
                tab.isNewTab = false;
            }
        } catch {}

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
    if (!tab || !String(value ?? "").trim()) return;

    const input = String(value).trim();

    clearTabTimer(tab);

    if (isPlayablesUrl(input)) {
        tab.url = "/-/";
        tab.isNewTab = false;
        tab.page.hidden = true;
        tab.frame = null;

        updateTabTitle(tab);
        setTabFavicon(tab);
        syncAddressBar(tab);
        updateReloadButton(tab);

        tab.iframe.src = "/-/";
        return;
    }

    const url = norm(input);

    if (!scramjet) return;

    tab.url = url;
    tab.isNewTab = false;
    tab.page.hidden = true;

    updateTabTitle(tab);
    setTabFavicon(tab);
    syncAddressBar(tab);
    updateReloadButton(tab);

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

urlInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        go();
    }
});

document.getElementById("newTab").addEventListener("click", createTab);

document.getElementById("backBtn").addEventListener("click", () => {
    const tab = tabs.get(activeTabId);

    if (!tab?.frame?.back || isPlayablesUrl(tab.url)) return;

    clearTabTimer(tab);
    tab.frame.back();
    startNavigationFallback(tab);
});

document.getElementById("forwardBtn").addEventListener("click", () => {
    const tab = tabs.get(activeTabId);

    if (!tab?.frame?.forward || isPlayablesUrl(tab.url)) return;

    clearTabTimer(tab);
    tab.frame.forward();
    startNavigationFallback(tab);
});

reloadBtn.addEventListener("click", () => {
    const tab = tabs.get(activeTabId);

    if (!tab || isPlayablesUrl(tab.url)) return;

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

fullscreenbtn.addEventListener("click", async () => {
    const activetab = document.querySelector(".viewport iframe.active");

    if (!activetab) return;

    try {
        if (document.fullscreenElement === activetab) {
            await document.exitFullscreen();
        } else {
            await activetab.requestFullscreen();
        }
    } catch (error) {
        console.error(error);
    }
});

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
