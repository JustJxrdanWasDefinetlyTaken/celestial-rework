import storage from "./storage.js";

var grid = document.querySelector(".gs");
var search = document.querySelector(".textbook");
var cat = document.querySelectorAll("select")[0];
var order = document.querySelectorAll("select")[1];

/** The localstorage key that has all the favorite games */
const FAVORITES_KEY = "favoriteGames";

/** SVG paths for the heart icons for favorited games */
const HEART_OUTLINE =
  "m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z";
const HEART_FILLED =
  "m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z";

function showGames(list) {
  grid.innerHTML = "";
  const favorites = storage.get(FAVORITES_KEY, []);
  list.forEach((g, index) => {
    // loop through all the games in /assets/json/books.json
    const isFavorited = favorites.includes(g.name);
    const heartPath = isFavorited ? HEART_FILLED : HEART_OUTLINE;
    const imageLoading = index < 12 ? "eager" : "lazy";
    const imagePriority = index < 12 ? "high" : "auto";

    /**
     * Separate the card HTML so it's visually easier to understand & modify
     *
     * also the SVG has to be in-line so CSS can touch it's colors ðŸ¥²
     * I know it seems a bit unoptimized, having a new SVG for every card, but since it's
     * just math and the size of it is pretty small, it shouldn't really matter much
     */
    let cardHTML = `
    <div class="thumb"><img loading="${imageLoading}" decoding="async" fetchpriority="${imagePriority}" src="${g.img}" alt="${g.name}"></div>
    <p>${g.name}</p>
    <svg class="favoriteBook" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="24" height="24" fill="currentColor"> <path d="${heartPath}"/> </svg>

    `;

    var card = document.createElement("div"); // create a new game card
    card.className = "card";
    card.onclick = () => {
      if (g.source === "dice") {
        rngGame();
      } else if (g.source === "local") {
        location.href = "/news/frame.html?mbed=" + g.url;
      } else {
        location.href = `/tab.html?autofill=${encodeURIComponent(g.url)}`;
      }
    };
    card.innerHTML = cardHTML;
    grid.appendChild(card);

    // mark card as favorited if it's in the favorites list
    if (isFavorited) {
      card.classList.add("favorited");
    }

    // make the heart clickable
    const heart = card.querySelector(".favoriteBook");
    heart.addEventListener("click", (e) => {
      e.stopPropagation(); // prevent navigating when clicking heart
      toggleFavorite(g.name);
      card.classList.toggle("favorited"); // toggle the favorited class

      // swap the heart icon between filled and outline
      const heartPathElement = heart.querySelector("path");
      const currentPath = heartPathElement.getAttribute("d");
      heartPathElement.setAttribute(
        "d",
        currentPath === HEART_FILLED ? HEART_OUTLINE : HEART_FILLED
      );
    });
  });
}

/**
 * toggle a game's favorite status and push it to localStorage
 * @param {string} gameName - The name of the game to toggle
 */
function toggleFavorite(gameName) {
  const favorites = storage.get(FAVORITES_KEY, []); // the [] (an empty list) is the default item if the key returns nothing
  const index = favorites.indexOf(gameName);
  if (index > -1) {
    // check if the game's already in there already
    // game is in there
    favorites.splice(index, 1);
  } else {
    // game's not in there
    favorites.push(gameName);
  }

  // update localstorage
  storage.set(FAVORITES_KEY, favorites);
}

// main game func
fetch("/assets/json/books.json")
  .then((res) => res.json())
  .then((games) => {
    const originalGames = [...games];

    // update games based on cat
    function update() {
      let filtered = originalGames.filter((g) =>
        g.name.toLowerCase().includes(search.value.toLowerCase())
      );
      if (cat.value === "exclusive")
        filtered = filtered.filter((g) => g.type === "exclusive");
      else if (cat.value !== "all")
        filtered = filtered.filter((g) => g.categories?.includes(cat.value));

      // Apply alphabetical or new sorting first
      if (order.value === "abc")
        filtered.sort((a, b) => a.name.localeCompare(b.name));
      else if (order.value === "new") filtered = [...filtered].reverse();

      // Sort favorites to the front (stable sort maintains existing order)
      const favorites = storage.get(FAVORITES_KEY, []);
      filtered.sort((a, b) => {
        const aFav = favorites.includes(a.name);
        const bFav = favorites.includes(b.name);
        if (aFav && !bFav) return -1; // a is favorited, b is not -> a comes first
        if (!aFav && bFav) return 1; // b is favorited, a is not -> b comes first
        return 0; // both favorited or both not -> maintain existing order
      });

      showGames(filtered);
    }

    // runs the function
    search.addEventListener("input", update);
    cat.addEventListener("change", update);
    order.addEventListener("change", update);

    // make sure ts loads
    update();
  });

function rngGame() {
  fetch("/assets/json/books.json")
    .then((res) => res.json())
    .then((games) => {
      const available = games.filter(
        (g) =>
          g.url &&
          g.source !== "dice" &&
          g.name !== "!! SUGGEST A GAME" &&
          g.name !== "! RANDOM GAME"
      );
      const rand = available[Math.floor(Math.random() * available.length)];
      location.href =
        rand.source === "local"
          ? "/news/frame.html?mbed=" + encodeURIComponent(rand.url)
          : `/tab.html?autofill=${encodeURIComponent(rand.url)}`;
    });
}

function gameCount() {
  fetch("/assets/json/books.json")
    .then((r) => r.json())
    .then((d) => {
      const input = document.querySelector(".textbook");
      input.placeholder = `search through ${(d.modules || d).length} games..`;
    });
}

gameCount();