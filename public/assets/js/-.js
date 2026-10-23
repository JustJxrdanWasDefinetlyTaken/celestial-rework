"use strict";

const xqv = "aHR0cHM6Ly8=";
const mzk = "Y2RuLm1hcmluY2FyZWVycy5vcmcv";
const pjt = "SnVzdEp4cmRhbldhc0RlZmluZXRseVRha2VuL2NlbGVzdGlhbC1yZXdvcmsvbWFpbi8=";
const qrw = atob(xqv) + atob(mzk);
const vbn = qrw + atob(pjt);
const assetCDN = vbn;

const GAME_JSON_URL = "https://cdn.statically.io/gh/celestialdevsalot/gassets@main/-.json";
const JSON_FALLBACKS = [
  "https://cdn.jsdelivr.net/gh/celestialdevsalot/gassets@main/-.json",
  "https://raw.githubusercontent.com/celestialdevsalot/gassets/refs/heads/main/-.json",
  "https://cdn.staticdelivr.com/gh/celestialdevsalot/gassets/main/-.json",
  assetCDN + "-.json"
];

const ASSET_CDNS = [
  "https://cdn.statically.io/gh/celestialdevsalot/gassets@main/",
  "https://cdn.jsdelivr.net/gh/celestialdevsalot/gassets@main/",
  "https://cdn.staticdelivr.com/gh/celestialdevsalot/gassets/main/",
  "https://raw.githubusercontent.com/celestialdevsalot/gassets/refs/heads/main/",
  assetCDN
];

const gamesEl = document.getElementById("games");
const statusEl = document.getElementById("status");
const searchEl = document.getElementById("search");
const filterButtons = [...document.querySelectorAll(".filter")];
const categoriesEl = document.getElementById("categories");
const BOOKMARK_KEY = "celestial-game-bookmarks-v1";

let GAME_CATALOG = [];
let currentView = "all";
let currentCategory = "all";
let bookmarks = readBookmarks();

function readBookmarks() {
  try {
    const value = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.filter(item => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...bookmarks]));
  } catch (error) {
    console.warn("could not save bookmarks", error);
  }
}

function asList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.games)) return data.games;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function resolveCandidates(value, sourceURL, isLocal) {
  if (!value) return [];
  const raw = String(value).trim();

  if (/^(https?:)?\/\//i.test(raw) || /^(data:|blob:)/i.test(raw)) {
    return [raw.startsWith("//") ? location.protocol + raw : raw];
  }

  const relative = raw.replace(/^\.\//, "").replace(/^\/+/, "");
  const candidates = [];

  for (const cdn of ASSET_CDNS) {
    try {
      candidates.push(new URL(relative, cdn.endsWith("/") ? cdn : cdn + "/").href);
    } catch {}
  }

  if (sourceURL) {
    try {
      candidates.push(new URL(relative, new URL("./", sourceURL)).href);
    } catch {}
  }

  if (isLocal) {
    try {
      candidates.push(new URL("/" + relative, location.origin).href);
    } catch {}
  }

  return [...new Set(candidates)];
}

function normalizeGames(data, sourceURL) {
  const seen = new Set();

  return asList(data).map((item, index) => {
    if (!item || typeof item !== "object") return null;

    const rawURL = firstValue(item, ["url", "path", "file", "html", "href"]);
    const func = firstValue(item, ["func"]);
    const rawImage = firstValue(item, ["img", "image", "thumbnail", "icon", "cover"]);
    if (!rawURL && !func) return null;

    const source = firstValue(item, ["source"]);
    const isLocal = source.toLowerCase() === "local";
    const urlCandidates = resolveCandidates(rawURL, sourceURL, isLocal);
    const imgCandidates = resolveCandidates(rawImage, sourceURL, isLocal);
    const name = firstValue(item, ["name", "title"]) || `book ${index + 1}`;
    const type = firstValue(item, ["type"]);
    const categories = Array.isArray(item.categories)
      ? item.categories.map(value => String(value).trim()).filter(Boolean)
      : [];
    const id = firstValue(item, ["id", "slug"]) || `${source}:${rawURL || func}`;

    if (seen.has(id)) return null;
    seen.add(id);

    return {
      id, name, type, categories, source, func,
      url: urlCandidates[0] || "",
      urlCandidates,
      img: imgCandidates[0] || "",
      imgCandidates,
      search: [name, type, source, ...categories].join(" ").toLowerCase()
    };
  }).filter(Boolean);
}

const gamePlayer = document.getElementById("game-player");
const gamePlayerTitle = document.getElementById("game-player-title");
const gameFrame = document.getElementById("game-frame");
const gamePlayerClose = document.getElementById("game-player-close");

function closeGame() {
  gamePlayer.classList.remove("open");
  gamePlayer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("game-playing");
  gameFrame.src = "about:blank";
}

async function fetchGameHTML(candidates, baseOverride = "") {
  let lastError;

  for (const candidate of candidates) {
    try {
      let url = candidate;
      const visited = new Set();

      for (let depth = 0; depth < 15; depth++) {
        if (visited.has(url)) throw new Error("wrapper loop detected");
        visited.add(url);

        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error("HTTP " + response.status);

        const html = await response.text();
        if (!html.trim()) throw new Error("empty HTML response");

        const doc = new DOMParser().parseFromString(html, "text/html");
        const embedded = doc.querySelector("iframe[src], object[data]");
        const embeddedPath = embedded?.getAttribute("src") || embedded?.getAttribute("data");

        if (embeddedPath && !/^(javascript:|data:|blob:|about:|#)/i.test(embeddedPath)) {
          const next = new URL(embeddedPath, url).href;
          if (next !== url) {
            url = next;
            continue;
          }
        }

        const directory = new URL("./", url).href;
        const fallbackBase = '<base href="' + directory.replace(/&/g, "&amp;").replace(/\"/g, "&quot;") + '">';
        let prepared = html;

        if (/<head\b[^>]*>/i.test(prepared)) {
          if (!/<base\b[^>]*>/i.test(prepared)) {
            prepared = prepared.replace(/<head\b[^>]*>/i, match => match + fallbackBase);
          }
        } else {
          prepared = '<!doctype html><html><head>' + fallbackBase + '</head><body>' + prepared + '</body></html>';
        }

        return { html: prepared, url };
      }

      throw new Error("too many HTML wrappers");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("could not fetch game HTML");
}

async function openGame(game) {
  const url = game.urlCandidates?.[0] || game.url;

  if (game.source.toLowerCase() === "local") {
    if (!game.urlCandidates?.length && !url) {
      alert("this book does not have a playable url.");
      return;
    }

    gamePlayerTitle.textContent = game.name;
    gamePlayer.classList.add("open");
    gamePlayer.setAttribute("aria-hidden", "false");
    document.body.classList.add("game-playing");
    gameFrame.srcdoc = '<!doctype html><html><body style="margin:0;background:#08090c;color:white;font-family:system-ui;display:grid;place-items:center;height:100vh">Loading book...</body></html>';
    if (window.lucide) window.lucide.createIcons();

    try {
      const result = await fetchGameHTML(
        game.urlCandidates?.length ? game.urlCandidates : [url],
        "https://cdn.jsdelivr.net/gh/technonyte00/deltarune@main/"
      );
      if (gamePlayer.classList.contains("open")) gameFrame.srcdoc = result.html;
    } catch (error) {
      if (gamePlayer.classList.contains("open")) {
        gameFrame.srcdoc = '<!doctype html><html><body style="margin:0;padding:24px;background:#08090c;color:white;font-family:system-ui"><h3>Could not load book</h3><p>' + String(error.message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</p><p>The CDN may block browser fetch requests (CORS), or the game URL may be unavailable.</p></body></html>';
      }
    }
    return;
  }

  if (game.func) {
    const match = game.func.match(/^\s*sendRequest\s*\(\s*(['"])(.*?)\1\s*\)\s*;?\s*$/s);

    if (match) {
      if (typeof window.sendRequest === "function") {
        window.sendRequest(match[2]);
      } else {
        alert("the proxy request function (sendRequest) is not available on this page.");
      }
      return;
    }
  }

  if (!url) {
    alert("this book does not have a playable url.");
    return;
  }

  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) window.location.href = url;
}

gamePlayerClose.addEventListener("click", closeGame);

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && gamePlayer.classList.contains("open")) {
    closeGame();
  }
});

function makeCard(game) {
  const card = document.createElement("div");
  card.className = "game";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", "open " + game.name);

  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  const imageCandidates = game.imgCandidates || [];
  let imageIndex = 0;

  img.onerror = () => {
    imageIndex++;
    if (imageIndex < imageCandidates.length) {
      img.src = imageCandidates[imageIndex];
    } else {
      img.style.display = "none";
    }
  };

  if (imageCandidates.length) img.src = imageCandidates[0];
  else img.style.display = "none";
  card.appendChild(img);

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = game.name;
  card.appendChild(name);

  if (game.type) {
    const type = document.createElement("span");
    type.className = "game-type";
    type.textContent = game.type;
    card.appendChild(type);
  }

  const save = document.createElement("button");
  save.type = "button";
  save.className = "bookmark" + (bookmarks.has(game.id) ? " saved" : "");
  save.innerHTML = '<i data-lucide="star"></i>';
  save.title = bookmarks.has(game.id) ? "remove bookmark" : "bookmark book";
  save.setAttribute("aria-label", save.title);
  save.addEventListener("click", event => {
    event.stopPropagation();
    toggleBookmark(game.id);
  });
  card.appendChild(save);

  card.addEventListener("click", () => openGame(game));
  card.addEventListener("keydown", event => {
    if (event.target === card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openGame(game);
    }
  });

  return card;
}

function renderCategories() {
  const allCategories = [...new Set(
    GAME_CATALOG.flatMap(game => game.categories || [])
      .map(value => String(value).trim().toLowerCase())
      .filter(Boolean)
  )].sort();

  categoriesEl.replaceChildren();

  const all = document.createElement("button");
  all.type = "button";
  all.className = "category" + (currentCategory === "all" ? " active" : "");
  all.textContent = "all categories";
  all.addEventListener("click", () => {
    currentCategory = "all";
    renderCategories();
    render();
  });
  categoriesEl.appendChild(all);

  for (const category of allCategories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category" + (currentCategory === category ? " active" : "");
    button.textContent = category;
    button.addEventListener("click", () => {
      currentCategory = category;
      renderCategories();
      render();
    });
    categoriesEl.appendChild(button);
  }
}

function render() {
  const query = searchEl.value.trim().toLowerCase();
  const visible = GAME_CATALOG.filter(game => {
    const matches = !query || game.search.includes(query);
    const categoryMatches = currentCategory === "all" ||
      (game.categories || []).some(category => String(category).toLowerCase() === currentCategory);
    return matches && categoryMatches &&
      (currentView !== "bookmarks" || bookmarks.has(game.id));
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const fragment = document.createDocumentFragment();
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = currentView === "bookmarks" && !query
      ? "no bookmarks yet. hover over a book and click ☆ to save it."
      : "none found.";
    fragment.appendChild(empty);
  } else {
    visible.forEach(game => fragment.appendChild(makeCard(game)));
  }

  gamesEl.replaceChildren(fragment);
  if (window.lucide) window.lucide.createIcons();
  statusEl.textContent = `${visible.length} ${visible.length === 1 ? "book" : "books"}${currentView === "bookmarks" ? " bookmarked" : ""}`;
  statusEl.style.display = "none";
}

function toggleBookmark(id) {
  if (bookmarks.has(id)) bookmarks.delete(id);
  else bookmarks.add(id);
  saveBookmarks();
  render();
}

searchEl.addEventListener("input", render);

filterButtons.forEach(button => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    filterButtons.forEach(item => item.classList.toggle("active", item === button));
    render();
  });
});

async function loadGames() {
  statusEl.textContent = "loading...";
  const sources = [...new Set([GAME_JSON_URL, ...JSON_FALLBACKS].filter(Boolean))];
  let lastError;

  for (const source of sources) {
    try {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) throw new Error(`http ${response.status}`);

      const text = await response.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch (error) {
        const trimmed = text.trim();
        const body = trimmed.replace(/^\s*\[/, "").replace(/\]\s*$/, "");
        data = JSON.parse("[" + body + "]");
      }

      const loaded = normalizeGames(data, source);
      if (!loaded.length) throw new Error("none found in this catalog.");

      GAME_CATALOG = loaded;
      renderCategories();
      render();
      return;
    } catch (error) {
      lastError = error;
      console.warn("book catalog source failed:", source, error);
    }
  }

  statusEl.textContent = "failed to load. report this to the community server.";
  gamesEl.replaceChildren();
  console.error("all book catalog sources failed", lastError);
}

if (window.lucide) window.lucide.createIcons();
loadGames();