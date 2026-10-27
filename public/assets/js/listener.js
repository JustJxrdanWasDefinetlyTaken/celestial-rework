const audio = document.querySelector("#audio");

const state = {
  view: "home",
  results: [],
  artists: [],
  albums: [],
  searchSource: "soundcloud",
  queue: JSON.parse(localStorage.getItem("celestial.queue") || "[]"),
  liked: JSON.parse(localStorage.getItem("celestial.liked") || "[]"),
  recent: JSON.parse(localStorage.getItem("celestial.recent") || "[]"),
  playlists: JSON.parse(localStorage.getItem("celestial.playlists") || "[]"),
  current: null,
  index: -1,
  playbackList: [],
  playbackSource: null,
  currentPlaylistId: null,
  pickerTrack: null,
  lyrics: [],
  lyricsLoadedFor: null,
  lyricsRequest: 0
};

const $ = s => document.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

function refreshIcons() {
  if (typeof lucide !== "undefined") {
    lucide.createIcons({
      attrs: {
        "stroke-width": 1.5
      }
    });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function save() {
  localStorage.setItem(
    "celestial.queue",
    JSON.stringify(state.queue)
  );

  localStorage.setItem(
    "celestial.liked",
    JSON.stringify(state.liked)
  );

  localStorage.setItem(
    "celestial.recent",
    JSON.stringify(state.recent)
  );

  localStorage.setItem(
    "celestial.playlists",
    JSON.stringify(state.playlists)
  );
}

function key(track) {
  return String(
    track?.videoId ||
    track?.id ||
    track?.trackId ||
    ""
  );
}

function artists(track) {
  return (
    track?.artists?.map(a => a.name).join(", ") ||
    track?.artist ||
    track?.user?.username ||
    track?.username ||
    "unknown artist"
  );
}

function duration(value) {
  const n = Number(value);

  if (Number.isFinite(n)) {
    const m = Math.floor(n / 60);
    const s = Math.floor(n % 60)
      .toString()
      .padStart(2, "0");

    return `${m}:${s}`;
  }

  return String(value || "—");
}

function imageFor(track) {
  if (track?.artworkUrl) {
    return track.artworkUrl;
  }

  if (track?.artwork_url) {
    return track.artwork_url;
  }

  if (track?.image) {
    return track.image;
  }

  if (track?.thumbnail) {
    return track.thumbnail;
  }

  if (track?.thumbnails?.length) {
    return [...track.thumbnails]
      .sort(
        (a, b) =>
          (b.width || 0) -
          (a.width || 0)
      )[0].url;
  }

  if (track?.videoId) {
    return `/api/music/m-img/${encodeURIComponent(
      track.videoId
    )}/maxresdefault.jpg?fit=square&size=256`;
  }

  return "";
}

function toast(message) {
  const el = $("#toast");

  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(
    () => el.classList.remove("show"),
    2200
  );
}

function normalizeTrack(item) {
  return {
    ...item,
    videoId:
      item.videoId ||
      item.id ||
      item.trackId,
    artist: artists(item),
    source:
      item.source ||
      state.searchSource ||
      "soundcloud"
  };
}

function albumName(track) {
  return String(
    track?.album?.name ||
    track?.album?.title ||
    track?.album ||
    ""
  ).trim();
}

function groupSearchResults(tracks) {
  const artistMap = new Map();
  const albumMap = new Map();

  tracks.forEach(track => {
    const t = normalizeTrack(track);

    const artist =
      t.artist ||
      "unknown artist";

    const artistKey =
      artist.toLowerCase();

    if (!artistMap.has(artistKey)) {
      artistMap.set(
        artistKey,
        {
          name: artist,
          image: imageFor(t),
          tracks: []
        }
      );
    }

    artistMap
      .get(artistKey)
      .tracks
      .push(t);

    const album =
      albumName(t);

    if (album) {
      const albumKey =
        `${artistKey}:${album.toLowerCase()}`;

      if (!albumMap.has(albumKey)) {
        albumMap.set(
          albumKey,
          {
            name: album,
            artist,
            image: imageFor(t),
            tracks: []
          }
        );
      }

      albumMap
        .get(albumKey)
        .tracks
        .push(t);
    }
  });

  state.artists =
    [...artistMap.values()]
      .map(artist => ({
        ...artist,
        tracks:
          artist.tracks.slice(
            0,
            5
          )
      }))
      .slice(0, 8);

  state.albums =
    [...albumMap.values()]
      .slice(0, 12);
}

function renderCard(track) {
  const t =
    normalizeTrack(track);

  return `
    <article
      class="track-card"
      data-id="${escapeHtml(
        key(t)
      )}"
    >
      <img
        class="cover"
        src="${escapeHtml(
          imageFor(t)
        )}"
        alt=""
      >

      <div class="card-title">
        ${escapeHtml(
          t.title ||
          "untitled"
        )}
      </div>

      <div class="card-artist">
        ${escapeHtml(
          t.artist
        )}
      </div>
    </article>
  `;
}

function renderHome() {
  const list =
    $("#home-recent");

  if (!list) return;

  const recent =
    state.recent.slice(0, 4);

  list.innerHTML =
    recent
      .map(renderCard)
      .join("");

  const empty =
    $("#home-empty");

  if (empty) {
    empty.style.display =
      recent.length
        ? "none"
        : "";
  }

  bindCards(list);
  refreshIcons();
}

function renderList(
  selector,
  tracks
) {
  const container =
    $(selector);

  if (!container) return;

  if (!tracks.length) {
    container.innerHTML = `
      <div class="empty-state">
        nothing yet.
      </div>
    `;

    return;
  }

  container.innerHTML =
    tracks
      .map((raw, index) => {
        const t =
          normalizeTrack(raw);

        const liked =
          state.liked.some(
            x =>
              key(x) ===
              key(t)
          );

        return `
          <div
            class="result-row"
            data-index="${index}"
          >
            <img
              class="cover"
              src="${escapeHtml(
                imageFor(t)
              )}"
              alt=""
            >

            <div class="result-main">
              <div class="result-title">
                ${escapeHtml(
                  t.title ||
                  "untitled"
                )}
              </div>

              <div class="result-artist">
                ${escapeHtml(
                  t.artist
                )}
                ${
                  albumName(t)
                    ? ` · ${escapeHtml(albumName(t))}`
                    : ""
                }
              </div>
            </div>

            <div class="result-duration">
              ${escapeHtml(
                duration(
                  t.duration ||
                  t.durationSeconds
                )
              )}
            </div>

            <div class="row-actions">
              <button
                class="play-row"
                type="button"
                aria-label="play"
              >
                <i
                  data-lucide="play"
                  aria-hidden="true"
                ></i>
              </button>

              <button
                class="like-row"
                type="button"
                aria-label="like"
              >
                <i
                  data-lucide="${
                    liked
                      ? "heart"
                      : "heart"
                  }"
                  aria-hidden="true"
                ></i>
              </button>

              <button
                class="playlist-row"
                type="button"
                aria-label="playlist"
              >
                <i
                  data-lucide="list-plus"
                  aria-hidden="true"
                ></i>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

  $$(".result-row", container)
    .forEach(row => {
      const index =
        Number(
          row.dataset.index
        );

      const playButton =
        row.querySelector(
          ".play-row"
        );

      const likeButton =
        row.querySelector(
          ".like-row"
        );

      const playlistButton =
        row.querySelector(
          ".playlist-row"
        );

      if (playButton) {
        playButton.onclick = e => {
          e.stopPropagation();

          playTrack(
            tracks[index],
            index,
            tracks
          );
        };
      }

      if (likeButton) {
        likeButton.onclick = e => {
          e.stopPropagation();

          toggleLike(
            tracks[index]
          );

          renderList(
            selector,
            tracks
          );
        };
      }

      if (playlistButton) {
        playlistButton.onclick = e => {
          e.stopPropagation();

          openPlaylistPicker(
            tracks[index]
          );
        };
      }

      row.onclick = () =>
        playTrack(
          tracks[index],
          index,
          tracks
        );
    });

  refreshIcons();
}

function bindCards(container) {
  if (!container) return;

  container
    .querySelectorAll(
      ".track-card"
    )
    .forEach(card => {
      card.onclick = () => {
        const id =
          card.dataset.id;

        const track =
          state.recent.find(
            x =>
              key(x) === id
          ) ||
          state.results.find(
            x =>
              key(x) === id
          );

        if (track) {
          playTrack(track);
        }
      };
    });
}

async function setMusicSource(source) {
  const response =
    await fetch(
      "/api/music/source",
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json"
        },
        body: JSON.stringify({
          source
        })
      }
    );

  if (!response.ok) {
    throw new Error(
      "source unavailable"
    );
  }

  state.searchSource =
    source;
}

async function fetchSearch(
  q,
  source
) {
  await setMusicSource(
    source
  );

  const response =
    await fetch(
      `/api/music/search?q=${encodeURIComponent(
        q
      )}&source=${encodeURIComponent(
        source
      )}`
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
      "search failed"
    );
  }

  const items =
    Array.isArray(data)
      ? data
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.results)
          ? data.results
          : [];

  const actualSource =
    data.source ||
    source;

  state.searchSource =
    actualSource;

  return items.map(
    item =>
      normalizeTrack({
        ...item,
        source:
          item.source ||
          actualSource
      })
  );
}

function renderSearchGroups() {
  const results =
    $("#searchResults");

  if (!results) return;

  const artistsHtml =
    state.artists.length
      ? `
        <section class="search-group">
          <div class="search-group-heading">
            <h3>artists</h3>
          </div>

          <div class="artist-grid">
            ${state.artists
              .map(
                (
                  artist,
                  artistIndex
                ) => `
                  <article
                    class="artist-card"
                    data-artist-index="${artistIndex}"
                  >
                    <img
                      src="${escapeHtml(
                        artist.image
                      )}"
                      alt=""
                    >

                    <div class="artist-name">
                      ${escapeHtml(
                        artist.name
                      )}
                    </div>

                    <div class="artist-label">
                      artist
                    </div>

                    <div class="artist-top-songs">
                      ${artist.tracks
                        .map(
                          (
                            track,
                            trackIndex
                          ) => `
                            <button
                              class="artist-song"
                              type="button"
                              data-artist-index="${artistIndex}"
                              data-track-index="${trackIndex}"
                            >
                              <span>
                                ${escapeHtml(
                                  track.title ||
                                  "untitled"
                                )}
                              </span>

                              <i
                                data-lucide="play"
                                aria-hidden="true"
                              ></i>
                            </button>
                          `
                        )
                        .join("")}
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `
      : "";

  const albumsHtml =
    state.albums.length
      ? `
        <section class="search-group">
          <div class="search-group-heading">
            <h3>albums</h3>
          </div>

          <div class="album-grid">
            ${state.albums
              .map(
                (
                  album,
                  albumIndex
                ) => `
                  <article
                    class="album-card"
                    data-album-index="${albumIndex}"
                  >
                    <img
                      src="${escapeHtml(
                        album.image
                      )}"
                      alt=""
                    >

                    <div class="album-name">
                      ${escapeHtml(
                        album.name
                      )}
                    </div>

                    <div class="album-artist">
                      ${escapeHtml(
                        album.artist
                      )}
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `
      : "";

  results.innerHTML = `
    ${artistsHtml}

    ${albumsHtml}

    <section class="search-group">
      <div class="search-group-heading">
        <h3>songs</h3>

        <span>
          ${escapeHtml(
            state.searchSource
          )}
        </span>
      </div>

      <div
        id="searchSongResults"
        class="results"
      ></div>
    </section>
  `;

  renderList(
    "#searchSongResults",
    state.results
  );

  $$(".artist-song", results)
    .forEach(button => {
      button.onclick = event => {
        event.stopPropagation();

        const artistIndex =
          Number(
            button.dataset
              .artistIndex
          );

        const trackIndex =
          Number(
            button.dataset
              .trackIndex
          );

        const artist =
          state.artists[
            artistIndex
          ];

        const track =
          artist?.tracks?.[
            trackIndex
          ];

        if (track) {
          playTrack(
            track,
            trackIndex,
            artist.tracks,
            {
              type: "artist",
              name: artist.name
            }
          );
        }
      };
    });

  $$(".album-card", results)
    .forEach(card => {
      card.onclick = () => {
        const album =
          state.albums[
            Number(
              card.dataset
                .albumIndex
            )
          ];

        if (
          album?.tracks?.length
        ) {
          playTrack(
            album.tracks[0],
            0,
            album.tracks,
            {
              type: "album",
              name: album.name
            }
          );
        }
      };
    });

  refreshIcons();
}

async function search(query) {
  const q =
    query.trim();

  if (!q) return;

  const status =
    $("#searchStatus");

  const results =
    $("#searchResults");

  if (status) {
    status.textContent =
      "searching soundcloud...";
  }

  if (results) {
    results.innerHTML = "";
  }

  try {
    let tracks = [];

    try {
      tracks =
        await fetchSearch(
          q,
          "soundcloud"
        );
    } catch {
      tracks = [];
    }

    if (!tracks.length) {
      if (status) {
        status.textContent =
          "soundcloud unavailable, trying youtube...";
      }

      tracks =
        await fetchSearch(
          q,
          "youtube"
        );
    }

    state.results =
      tracks;

    groupSearchResults(
      state.results
    );

    if (status) {
      status.textContent =
        `${state.results.length} results from ${state.searchSource}`;
    }

    renderSearchGroups();
  } catch (error) {
    state.results = [];
    state.artists = [];
    state.albums = [];

    if (status) {
      status.textContent = "";
    }

    if (results) {
      results.innerHTML = `
        <div class="empty-state">
          ${escapeHtml(
            error.message ||
            "search failed"
          )}
        </div>
      `;
    }
  }
}

function toggleLike(track) {
  const id =
    key(track);

  if (!id) return;

  const i =
    state.liked.findIndex(
      x =>
        key(x) === id
    );

  if (i >= 0) {
    state.liked.splice(
      i,
      1
    );

    toast(
      "removed from liked songs"
    );
  } else {
    state.liked.unshift(
      normalizeTrack(track)
    );

    toast(
      "added to liked songs"
    );
  }

  save();
  updatePlayer();
  renderHome();

  if (
    state.view === "liked"
  ) {
    renderList(
      "#likedResults",
      state.liked
    );
  }
}

function addRecent(track) {
  const t =
    normalizeTrack(track);

  state.recent = [
    t,
    ...state.recent.filter(
      x =>
        key(x) !==
        key(t)
    )
  ].slice(0, 50);

  save();
  renderHome();
}

async function playTrack(
  rawTrack,
  index = -1,
  list = state.results,
  source = null
) {
  const track =
    normalizeTrack(rawTrack);

  if (!key(track)) return;

  state.current =
    track;

  state.index =
    index;

  state.playbackList =
    list || [];

  state.playbackSource =
    source;

  state.lyricsRequest++;

  state.lyricsLoadedFor =
    null;

  state.lyrics = [];

  audio.src =
    `/api/music/stream/${encodeURIComponent(
      key(track)
    )}?source=${encodeURIComponent(
      track.source ||
      state.searchSource ||
      "soundcloud"
    )}`;

  audio.load();

  updatePlayer();
  renderLyrics();

  if (
    typeof loadLyrics ===
    "function"
  ) {
    await loadLyrics(track);
  }

  try {
    await audio.play();

    addRecent(track);
  } catch {
    toast(
      "playback could not start. try pressing play."
    );
  }
}

function togglePlay() {
  if (!state.current) {
    setView("search");

    $("#searchInput")
      ?.focus();

    return;
  }

  if (audio.paused) {
    audio
      .play()
      .catch(
        () =>
          toast(
            "playback blocked"
          )
      );
  } else {
    audio.pause();
  }
}

function getNextTrack() {
  const list =
    state.playbackList;

  if (list.length) {
    if (
      state.index >= 0 &&
      state.index <
        list.length - 1
    ) {
      return {
        track:
          list[
            state.index + 1
          ],
        index:
          state.index + 1,
        list,
        source:
          state.playbackSource
      };
    }
  }

  return null;
}

function getPreviousTrack() {
  const list =
    state.playbackList;

  if (list.length) {
    if (state.index > 0) {
      return {
        track:
          list[
            state.index - 1
          ],
        index:
          state.index - 1,
        list,
        source:
          state.playbackSource
      };
    }

    if (state.index === 0) {
      return {
        track: list[0],
        index: 0,
        list,
        source:
          state.playbackSource
      };
    }
  }

  return null;
}

function nextTrack() {
  const next =
    getNextTrack();

  if (!next) return;

  playTrack(
    next.track,
    next.index,
    next.list,
    next.source
  );
}

function previousTrack() {
  const previous =
    getPreviousTrack();

  if (!previous) return;

  playTrack(
    previous.track,
    previous.index,
    previous.list,
    previous.source
  );
}

function setView(view) {
  state.view =
    view;

  $$(".view").forEach(
    el =>
      el.classList.add(
        "hidden"
      )
  );

  $(`#view-${view}`)
    ?.classList.remove(
      "hidden"
    );

  $$(".nav-link").forEach(
    el =>
      el.classList.toggle(
        "active",
        el.dataset.view ===
          view
      )
  );

  if (view === "home") {
    renderHome();
  }

  if (view === "liked") {
    renderList(
      "#likedResults",
      state.liked
    );
  }

  if (view === "recent") {
    renderList(
      "#recentResults",
      state.recent
    );
  }

  if (view === "queue") {
    renderList(
      "#queueResults",
      state.queue
    );
  }

  if (
    view === "playlists" &&
    typeof renderPlaylists ===
      "function"
  ) {
    renderPlaylists();
  }

  if (
    view === "playlist" &&
    typeof renderPlaylist ===
      "function"
  ) {
    renderPlaylist();
  }

  if (
    view === "lyrics" &&
    typeof renderLyrics ===
      "function"
  ) {
    renderLyrics();
  }

  refreshIcons();
}

$$("[data-view]").forEach(
  button => {
    button.addEventListener(
      "click",
      () => {
        const view =
          button.dataset.view;

        if (view) {
          setView(view);
        }
      }
    );
  }
);

const searchInput =
  $("#searchInput");

if (searchInput) {
  searchInput.addEventListener(
    "keydown",
    event => {
      if (
        event.key ===
        "Enter"
      ) {
        search(
          searchInput.value
        );
      }
    }
  );
}

$("#playButton")
  ?.addEventListener(
    "click",
    togglePlay
  );

$("#nextButton")
  ?.addEventListener(
    "click",
    nextTrack
  );

$("#previousButton")
  ?.addEventListener(
    "click",
    previousTrack
  );

audio?.addEventListener(
  "ended",
  nextTrack
);

renderHome();
refreshIcons();