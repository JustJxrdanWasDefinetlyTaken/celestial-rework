const audio = document.querySelector("#audio");

const state = {
  view: "home",
  results: [],
  queue: JSON.parse(localStorage.getItem("celestial.queue") || "[]"),
  liked: JSON.parse(localStorage.getItem("celestial.liked") || "[]"),
  recent: JSON.parse(localStorage.getItem("celestial.recent") || "[]"),
  playlists: JSON.parse(localStorage.getItem("celestial.playlists") || "[]"),
  current: null,
  index: -1,
  playbackList: [],
  playbackSource: "",
  pickerTrack: null,
  currentPlaylist: null,
  lyrics: [],
  lyricIndex: -1,
  searchSource: "youtube",
  artists: [],
  albums: []
};

const $ = selector =>
  document.querySelector(selector);

const $$ = selector =>
  [...document.querySelectorAll(selector)];

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshIcons() {
  if (
    window.lucide &&
    typeof window.lucide.createIcons === "function"
  ) {
    window.lucide.createIcons();
  }
}

function toast(message) {
  let element =
    document.querySelector(".toast");

  if (!element) {
    element =
      document.createElement("div");

    element.className =
      "toast";

    document.body.appendChild(
      element
    );
  }

  element.textContent =
    message;

  element.classList.add(
    "show"
  );

  clearTimeout(
    toast.timer
  );

  toast.timer =
    setTimeout(() => {
      element.classList.remove(
        "show"
      );
    }, 2200);
}

function key(track) {
  return String(
    track?.id ||
    track?.videoId ||
    track?.trackId ||
    track?.songId ||
    ""
  );
}

function trackTitle(track) {
  return String(
    track?.title ||
    track?.name ||
    track?.song ||
    "unknown title"
  );
}

function trackArtist(track) {
  if (
    Array.isArray(
      track?.artists
    )
  ) {
    const names =
      track.artists
        .map(artist =>
          typeof artist === "string"
            ? artist
            : artist?.name
        )
        .filter(Boolean);

    if (names.length) {
      return names.join(", ");
    }
  }

  if (
    typeof track?.artist ===
    "string"
  ) {
    return track.artist;
  }

  return String(
    track?.artist?.name ||
    track?.author ||
    track?.uploader ||
    "unknown artist"
  );
}

function trackArtwork(track) {
  if (!track) {
    return "";
  }

  const values = [
    track.artwork,
    track.artworkUrl,
    track.artwork_url,
    track.cover,
    track.coverUrl,
    track.cover_url,
    track.image,
    track.imageUrl,
    track.image_url,
    track.picture,
    track.pictureUrl,
    track.picture_url,
    track.albumArt,
    track.album_art,
    track.album?.artwork,
    track.album?.artworkUrl,
    track.album?.artwork_url,
    track.album?.cover,
    track.album?.coverUrl,
    track.album?.cover_url,
    track.album?.image,
    track.album?.imageUrl,
    track.album?.image_url
  ];

  for (const value of values) {
    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }

    if (
      value &&
      typeof value === "object" &&
      typeof value.url === "string" &&
      value.url.trim()
    ) {
      return value.url.trim();
    }
  }

  const arrays = [
    track.thumbnails,
    track.thumbnail,
    track.images,
    track.album?.thumbnails,
    track.album?.images
  ];

  for (const array of arrays) {
    if (
      !Array.isArray(array) ||
      !array.length
    ) {
      continue;
    }

    for (
      let i = array.length - 1;
      i >= 0;
      i--
    ) {
      const value = array[i];

      if (
        typeof value === "string" &&
        value.trim()
      ) {
        return value.trim();
      }

      if (
        value &&
        typeof value.url === "string" &&
        value.url.trim()
      ) {
        return value.url.trim();
      }

      if (
        value &&
        typeof value.src === "string" &&
        value.src.trim()
      ) {
        return value.src.trim();
      }
    }
  }

  if (
    typeof track.thumbnail === "string" &&
    track.thumbnail.trim()
  ) {
    return track.thumbnail.trim();
  }

  if (
    typeof track.thumbnail?.url === "string"
  ) {
    return track.thumbnail.url;
  }

  return "";
}

function trackDuration(track) {
  const duration =
    track?.duration ??
    track?.durationSeconds ??
    track?.duration_seconds ??
    track?.length ??
    0;

  if (
    typeof duration ===
    "number"
  ) {
    return duration;
  }

  if (
    typeof duration ===
      "string" &&
    /^\d+(\.\d+)?$/.test(
      duration
    )
  ) {
    return Number(duration);
  }

  if (
    typeof duration ===
      "string" &&
    duration.includes(":")
  ) {
    const parts =
      duration
        .split(":")
        .map(Number);

    if (
      parts.every(
        Number.isFinite
      )
    ) {
      let seconds = 0;

      for (
        const part
        of parts
      ) {
        seconds =
          seconds * 60 +
          part;
      }

      return seconds;
    }
  }

  return 0;
}

function formatTime(seconds) {
  if (
    !Number.isFinite(
      seconds
    ) ||
    seconds < 0
  ) {
    return "0:00";
  }

  const rounded =
    Math.floor(seconds);

  const minutes =
    Math.floor(
      rounded / 60
    );

  const remaining =
    rounded % 60;

  return `${minutes}:${String(
    remaining
  ).padStart(2, "0")}`;
}

function normalizeTrack(track) {
  if (!track) {
    return {};
  }

  const id =
    key(track);

  const title =
    trackTitle(track);

  const artist =
    trackArtist(track);

  const artwork =
    trackArtwork(track);

  const duration =
    trackDuration(track);

  const source =
    String(
      track?.source ||
      track?.provider ||
      state.searchSource ||
      "youtube"
    ).toLowerCase();

  return {
    ...track,
    id,
    videoId:
      track?.videoId ||
      (
        source ===
        "youtube"
          ? id
          : track?.videoId
      ),
    title,
    artist,
    artwork,
    duration,
    source,
    provider:
      track?.provider ||
      source
  };
}

function sameTrack(
  first,
  second
) {
  const firstKey =
    key(first);

  const secondKey =
    key(second);

  return Boolean(
    firstKey &&
    secondKey &&
    firstKey === secondKey
  );
}

function isLiked(track) {
  return state.liked.some(
    item =>
      sameTrack(
        item,
        track
      )
  );
}

function toggleLike(track) {
  const normalized =
    normalizeTrack(track);

  const id =
    key(normalized);

  if (!id) return;

  const index =
    state.liked.findIndex(
      item =>
        key(item) === id
    );

  if (index >= 0) {
    state.liked.splice(
      index,
      1
    );

    toast(
      "removed from liked songs"
    );
  } else {
    state.liked.unshift(
      normalized
    );

    toast(
      "added to liked songs"
    );
  }

  save();

  renderLiked();
  renderHome();
  updateLikeButton();
}

function addRecent(track) {
  const normalized =
    normalizeTrack(track);

  const id =
    key(normalized);

  if (!id) return;

  state.recent =
    state.recent.filter(
      item =>
        key(item) !== id
    );

  state.recent.unshift(
    normalized
  );

  state.recent =
    state.recent.slice(
      0,
      50
    );

  save();

  renderRecent();
  renderHome();
}

function addToQueue(track) {
  const normalized =
    normalizeTrack(track);

  if (!key(normalized)) {
    return;
  }

  const matches = [
    track,
    state.results.find(
      item =>
        sameTrack(
          item,
          normalized
        )
    ),
    state.playbackList.find(
      item =>
        sameTrack(
          item,
          normalized
        )
    ),
    state.recent.find(
      item =>
        sameTrack(
          item,
          normalized
        )
    ),
    state.liked.find(
      item =>
        sameTrack(
          item,
          normalized
        )
    ),
    state.current &&
    sameTrack(
      state.current,
      normalized
    )
      ? state.current
      : null
  ];

  for (const item of matches) {
    const artwork =
      trackArtwork(item);

    if (artwork) {
      normalized.artwork =
        artwork;

      normalized.cover =
        artwork;

      normalized.image =
        artwork;

      break;
    }
  }

  state.queue.push(
  normalizeTrack(
    track
  )
);

  save();

  renderQueue();

  toast(
    "added to queue"
  );
}

function removeFromQueue(
  index
) {
  if (
    index < 0 ||
    index >=
      state.queue.length
  ) {
    return;
  }

  state.queue.splice(
    index,
    1
  );

  save();

  renderQueue();
}

function clearQueue() {
  state.queue = [];

  save();

  renderQueue();

  toast(
    "queue cleared"
  );
}

function setView(view) {
  state.view = view;

  $$(".view").forEach(
    element => {
      const active =
        element.id ===
          `view-${view}` ||
        element.id ===
          `${view}View` ||
        element.dataset.view ===
          view;

      element.classList.toggle(
        "hidden",
        !active
      );

      element.classList.toggle(
        "active",
        active
      );
    }
  );

  $$(".nav-link").forEach(
    button => {
      button.classList.toggle(
        "active",
        button.dataset.view ===
          view
      );
    }
  );

  if (
    view === "home"
  ) {
    renderHome();
  }

  if (
    view === "liked"
  ) {
    renderLiked();
  }

  if (
    view === "recent"
  ) {
    renderRecent();
  }

  if (
    view === "queue"
  ) {
    renderQueue();
  }

  if (
    view === "playlists"
  ) {
    renderPlaylists();
  }

  if (
    view === "playlist"
  ) {
    renderPlaylist();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  refreshIcons();
}

function updateLikeButton() {
  const button =
    $("#likeBtn");

  if (!button) {
    return;
  }

  const liked =
    state.current &&
    isLiked(
      state.current
    );

  button.classList.toggle(
    "active",
    Boolean(liked)
  );

  button.innerHTML =
    liked
      ? `<i data-lucide="heart" fill="currentColor"></i>`
      : `<i data-lucide="heart"></i>`;

  refreshIcons();
}

function updatePlayButton() {
  const button =
    $("#playBtn");

  if (!button) {
    return;
  }

  button.innerHTML =
    !audio.paused &&
    state.current
      ? `<i data-lucide="pause"></i>`
      : `<i data-lucide="play"></i>`;

  refreshIcons();
}

function updateMuteButton() {
  const button =
    $("#muteBtn");

  if (!button) {
    return;
  }

  let icon =
    "volume-2";

  if (
    audio.muted ||
    audio.volume === 0
  ) {
    icon =
      "volume-x";
  } else if (
    audio.volume < 0.5
  ) {
    icon =
      "volume-1";
  }

  button.innerHTML =
    `<i data-lucide="${icon}"></i>`;

  refreshIcons();
}

function updatePlayer() {
  const cover =
    $("#playerCover");

  const title =
    $("#playerTitle");

  const artist =
    $("#playerArtist");

  if (!state.current) {
    if (cover) {
      cover.src = "";
      cover.style.opacity =
        "0";
    }

    if (title) {
      title.textContent =
        "nothing playing";
    }

    if (artist) {
      artist.textContent =
        "";
    }

    updateLikeButton();
    updatePlayButton();

    return;
  }

  const track =
    normalizeTrack(
      state.current
    );

  const artwork =
    trackArtwork(track);

  if (cover) {
    if (artwork) {
      cover.src =
        artwork;

      cover.style.opacity =
        "1";
    } else {
      cover.removeAttribute(
        "src"
      );

      cover.style.opacity =
        "0";
    }
  }

  if (title) {
    title.textContent =
      trackTitle(track);
  }

  if (artist) {
    artist.textContent =
      trackArtist(track);
  }

  updateLikeButton();
  updatePlayButton();
}

function updateProgress() {
  const progress =
    $("#progress");

  const current =
    $("#currentTime");

  const duration =
    $("#duration");

  const total =
    Number.isFinite(
      audio.duration
    )
      ? audio.duration
      : trackDuration(
          state.current
        );

  const time =
    Number.isFinite(
      audio.currentTime
    )
      ? audio.currentTime
      : 0;

  if (progress) {
    progress.max =
      total || 0;

    progress.value =
      Math.min(
        time,
        total || time
      );
  }

  if (current) {
    current.textContent =
      formatTime(time);
  }

  if (duration) {
    duration.textContent =
      formatTime(total);
  }
}

function seekFromProgress() {
  const progress =
    $("#progress");

  if (!progress) {
    return;
  }

  const value =
    Number(
      progress.value
    );

  if (
    Number.isFinite(
      value
    )
  ) {
    audio.currentTime =
      value;
  }
}

function updateVolume() {
  const input =
    $("#volume");

  if (!input) {
    return;
  }

  const value =
    Number(
      input.value
    );

  if (
    !Number.isFinite(
      value
    )
  ) {
    return;
  }

  audio.volume =
    Math.max(
      0,
      Math.min(
        1,
        value
      )
    );

  audio.muted =
    audio.volume === 0;

  updateMuteButton();
}

function toggleMute() {
  if (
    audio.muted ||
    audio.volume === 0
  ) {
    audio.muted = false;

    if (
      audio.volume === 0
    ) {
      audio.volume =
        0.8;

      const input =
        $("#volume");

      if (input) {
        input.value =
          "0.8";
      }
    }
  } else {
    audio.muted =
      true;
  }

  updateMuteButton();
}

function togglePlay() {
  if (!state.current) {
    if (
      state.playbackList
        .length
    ) {
      playTrack(
        state.playbackList[
          Math.max(
            0,
            state.index
          )
        ]
      );
    }

    return;
  }

  if (audio.paused) {
    audio
      .play()
      .catch(() => {
        toast(
          "could not play song"
        );
      });
  } else {
    audio.pause();
  }
}

function nextTrack() {
  if (
    state.playbackList
      .length &&
    state.index + 1 <
      state.playbackList
        .length
  ) {
    state.index += 1;

    playTrack(
      state.playbackList[
        state.index
      ]
    );

    return;
  }

  if (
    state.queue.length
  ) {
    const next =
      state.queue.shift();

    save();

    renderQueue();

    state.playbackList = [
      normalizeTrack(next)
    ];

    state.index = 0;

    state.playbackSource =
      "queue";

    playTrack(next);
  }
}

function previousTrack() {
  if (
    audio.currentTime >
    3
  ) {
    audio.currentTime = 0;

    return;
  }

  if (
    state.playbackList
      .length &&
    state.index > 0
  ) {
    state.index -= 1;

    playTrack(
      state.playbackList[
        state.index
      ]
    );

    return;
  }

  audio.currentTime = 0;
}

function imageMarkup(
  track,
  className = "cover"
) {
  const artwork =
    trackArtwork(track);

  if (!artwork) {
    return `
      <div class="${className} cover-placeholder">
        <i data-lucide="music"></i>
      </div>
    `;
  }

  return `
    <img
      class="${className}"
      src="${escapeHtml(
        artwork
      )}"
      alt=""
      loading="lazy"
    >
  `;
}
function trackRow(
  track,
  index,
  options = {}
) {
  const normalized =
    normalizeTrack(track);

  const liked =
    isLiked(normalized);

  const duration =
    trackDuration(
      normalized
    );

  const remove =
    options.remove ===
      true;

  return `
    <div
      class="result-row"
      data-index="${index}"
    >
      ${imageMarkup(
        normalized
      )}

      <div class="result-info">
        <div class="result-title">
          ${escapeHtml(
            trackTitle(
              normalized
            )
          )}
        </div>

        <div class="result-subtitle">
          ${escapeHtml(
            trackArtist(
              normalized
            )
          )}
        </div>
      </div>

      <div class="result-duration">
        ${
          duration
            ? formatTime(
                duration
              )
            : ""
        }
      </div>

      <button
        class="icon-button row-like ${
          liked
            ? "active"
            : ""
        }"
        type="button"
        aria-label="like"
      >
        <i
          data-lucide="heart"
          ${
            liked
              ? `fill="currentColor"`
              : ""
          }
        ></i>
      </button>

      <button
        class="icon-button row-playlist"
        type="button"
        aria-label="add to playlist"
      >
        <i
          data-lucide="list-plus"
        ></i>
      </button>

      <button
        class="icon-button row-queue"
        type="button"
        aria-label="add to queue"
      >
        <i
          data-lucide="list-end"
        ></i>
      </button>

      ${
        remove
          ? `
            <button
              class="icon-button row-remove"
              type="button"
              aria-label="remove"
            >
              <i
                data-lucide="x"
              ></i>
            </button>
          `
          : ""
      }
    </div>
  `;
}

function bindTrackRows(
  container,
  tracks,
  source,
  options = {}
) {
  if (!container) {
    return;
  }

  container
    .querySelectorAll(
      ".result-row"
    )
    .forEach(row => {
      const index =
        Number(
          row.dataset.index
        );

      const track =
        tracks[index];

      if (!track) {
        return;
      }

      row.addEventListener(
        "dblclick",
        event => {
          if (
            event.target.closest(
              "button"
            )
          ) {
            return;
          }

          state.playbackList =
            tracks.map(
              normalizeTrack
            );

          state.index =
            index;

          state.playbackSource =
            source;

          playTrack(
            track
          );
        }
      );

      row.addEventListener(
        "click",
        event => {
          if (
            event.target.closest(
              "button"
            )
          ) {
            return;
          }

          state.playbackList =
            tracks.map(
              normalizeTrack
            );

          state.index =
            index;

          state.playbackSource =
            source;

          playTrack(
            track
          );
        }
      );

      row
        .querySelector(
          ".row-like"
        )
        ?.addEventListener(
          "click",
          event => {
            event.stopPropagation();

            toggleLike(
              track
            );

            if (
              typeof options
                .rerender ===
              "function"
            ) {
              options
                .rerender();
            }
          }
        );

      row
        .querySelector(
          ".row-playlist"
        )
        ?.addEventListener(
          "click",
          event => {
            event.stopPropagation();

            openPlaylistPicker(
              track
            );
          }
        );

      row
        .querySelector(
          ".row-queue"
        )
        ?.addEventListener(
          "click",
          event => {
            event.stopPropagation();

            addToQueue(
              track
            );
          }
        );

      row
        .querySelector(
          ".row-remove"
        )
        ?.addEventListener(
          "click",
          event => {
            event.stopPropagation();

            if (
              typeof options
                .remove ===
              "function"
            ) {
              options.remove(
                index
              );
            }
          }
        );
    });

  refreshIcons();
}

function trackCard(
  track,
  index
) {
  const normalized =
    normalizeTrack(track);

  const artwork =
    trackArtwork(
      normalized
    );

  return `
    <article
      class="track-card"
      data-index="${index}"
    >
      <div class="track-card-cover">
        ${
          artwork
            ? `
              <img
                src="${escapeHtml(
                  artwork
                )}"
                alt=""
                loading="lazy"
              >
            `
            : `
              <div class="cover-placeholder">
                <i
                  data-lucide="music"
                ></i>
              </div>
            `
        }

        <button
          class="track-card-play"
          type="button"
          aria-label="play"
        >
          <i
            data-lucide="play"
          ></i>
        </button>
      </div>

      <div class="track-card-title">
        ${escapeHtml(
          trackTitle(
            normalized
          )
        )}
      </div>

      <div class="track-card-artist">
        ${escapeHtml(
          trackArtist(
            normalized
          )
        )}
      </div>
    </article>
  `;
}

function bindTrackCards(
  container,
  tracks,
  source
) {
  if (!container) {
    return;
  }

  container
    .querySelectorAll(
      ".track-card"
    )
    .forEach(card => {
      const index =
        Number(
          card.dataset.index
        );

      const track =
        tracks[index];

      if (!track) {
        return;
      }

      const play = () => {
        state.playbackList =
          tracks.map(
            normalizeTrack
          );

        state.index =
          index;

        state.playbackSource =
          source;

        playTrack(track);
      };

      card.addEventListener(
        "click",
        event => {
          if (
            event.target.closest(
              "button"
            )
          ) {
            return;
          }

          play();
        }
      );

      card
        .querySelector(
          ".track-card-play"
        )
        ?.addEventListener(
          "click",
          event => {
            event.stopPropagation();

            play();
          }
        );
    });

  refreshIcons();
}

function renderHome() {
  const recent =
    $("#home-recent");

  if (recent) {
    const tracks =
      state.recent.slice(
        0,
        12
      );

    recent.innerHTML =
      tracks.length
        ? tracks
            .map(
              trackCard
            )
            .join("")
        : `
          <div class="empty-state">
            nothing here yet.
          </div>
        `;

    bindTrackCards(
      recent,
      tracks,
      "recent"
    );
  }

  const liked =
    $("#home-liked");

  if (liked) {
    const tracks =
      state.liked.slice(
        0,
        12
      );

    liked.innerHTML =
      tracks.length
        ? tracks
            .map(
              trackCard
            )
            .join("")
        : `
          <div class="empty-state">
            no liked songs yet.
          </div>
        `;

    bindTrackCards(
      liked,
      tracks,
      "liked"
    );
  }
}

function renderLiked() {
  const container =
    $("#likedResults");

  if (!container) {
    return;
  }

  container.innerHTML =
    state.liked.length
      ? state.liked
          .map(
            (
              track,
              index
            ) =>
              trackRow(
                track,
                index
              )
          )
          .join("")
      : `
        <div class="empty-state">
          no liked songs yet.
        </div>
      `;

  bindTrackRows(
    container,
    state.liked,
    "liked",
    {
      rerender:
        renderLiked
    }
  );
}

function renderRecent() {
  const container =
    $("#recentResults");

  if (!container) {
    return;
  }

  container.innerHTML =
    state.recent.length
      ? state.recent
          .map(
            (
              track,
              index
            ) =>
              trackRow(
                track,
                index
              )
          )
          .join("")
      : `
        <div class="empty-state">
          nothing here yet.
        </div>
      `;

  bindTrackRows(
    container,
    state.recent,
    "recent",
    {
      rerender:
        renderRecent
    }
  );
}

function renderQueue() {
  const container =
    $("#queueResults");

  if (!container) {
    return;
  }

  container.innerHTML =
    state.queue.length
      ? state.queue
          .map(
            (
              track,
              index
            ) =>
              trackRow(
                track,
                index,
                {
                  remove: true
                }
              )
          )
          .join("")
      : `
        <div class="empty-state">
          queue is empty.
        </div>
      `;

  bindTrackRows(
    container,
    state.queue,
    "queue",
    {
      rerender:
        renderQueue,
      remove(index) {
        removeFromQueue(
          index
        );
      }
    }
  );
}

function playlistCover(
  playlist
) {
  for (
    const track
    of playlist?.tracks ||
      []
  ) {
    const artwork =
      trackArtwork(track);

    if (artwork) {
      return artwork;
    }
  }

  return "";
}

function renderPlaylists() {
  const container =
    $("#playlistList");

  if (!container) {
    return;
  }

  if (
    !state.playlists.length
  ) {
    container.innerHTML = `
      <div class="empty-state">
        no playlists yet.
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.playlists
      .map(
        (
          playlist,
          index
        ) => {
          const cover =
            playlistCover(
              playlist
            );

          return `
            <button
              class="playlist-card"
              type="button"
              data-index="${index}"
            >
              <div class="playlist-card-cover">
                ${
                  cover
                    ? `
                      <img
                        src="${escapeHtml(
                          cover
                        )}"
                        alt=""
                      >
                    `
                    : `
                      <i
                        data-lucide="list-music"
                      ></i>
                    `
                }
              </div>

              <div class="playlist-card-info">
                <div class="playlist-card-title">
                  ${escapeHtml(
                    playlist.name
                  )}
                </div>

                <div class="playlist-card-subtitle">
                  ${
                    playlist
                      .tracks
                      ?.length ||
                    0
                  } songs
                </div>
              </div>
            </button>
          `;
        }
      )
      .join("");

  container
    .querySelectorAll(
      ".playlist-card"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const index =
            Number(
              button.dataset
                .index
            );

          const playlist =
            state.playlists[
              index
            ];

          if (!playlist) {
            return;
          }

          state.currentPlaylist =
            playlist.id;

          setView(
            "playlist"
          );
        }
      );
    });

  refreshIcons();
}

function renderPlaylist() {
  const playlist =
    state.playlists.find(
      item =>
        item.id ===
        state.currentPlaylist
    );

  const title =
    $("#playlistTitle");

  const container =
    $("#playlistTracks");

  if (!playlist) {
    if (title) {
      title.textContent =
        "playlist";
    }

    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          playlist not found.
        </div>
      `;
    }

    return;
  }

  if (title) {
    title.textContent =
      playlist.name;
  }

  if (!container) {
    return;
  }

  const tracks =
    Array.isArray(
      playlist.tracks
    )
      ? playlist.tracks
      : [];

  container.innerHTML =
    tracks.length
      ? tracks
          .map(
            (
              track,
              index
            ) =>
              trackRow(
                track,
                index,
                {
                  remove: true
                }
              )
          )
          .join("")
      : `
        <div class="empty-state">
          playlist is empty.
        </div>
      `;

  bindTrackRows(
    container,
    tracks,
    `playlist:${playlist.id}`,
    {
      rerender:
        renderPlaylist,
      remove(index) {
        playlist.tracks.splice(
          index,
          1
        );

        save();

        renderPlaylist();
        renderPlaylists();
        renderPlaylistPicker();
      }
    }
  );
}

function createPlaylist() {
  const name =
    prompt(
      "playlist name"
    );

  if (
    !name ||
    !name.trim()
  ) {
    return;
  }

  state.playlists.unshift({
    id: `playlist-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`,
    name: name.trim(),
    tracks: []
  });

  save();

  renderPlaylists();
  renderPlaylistPicker();

  toast(
    "playlist created"
  );
}

function deleteCurrentPlaylist() {
  const index =
    state.playlists.findIndex(
      playlist =>
        playlist.id ===
        state.currentPlaylist
    );

  if (index < 0) {
    return;
  }

  state.playlists.splice(
    index,
    1
  );

  state.currentPlaylist =
    null;

  save();

  renderPlaylists();
  renderPlaylistPicker();

  setView(
    "playlists"
  );

  toast(
    "playlist deleted"
  );
}

function addToPlaylist(
  playlistId,
  track
) {
  const playlist =
    state.playlists.find(
      item =>
        item.id ===
        playlistId
    );

  if (!playlist) {
    return;
  }

  const normalized =
    normalizeTrack(track);

  const id =
    key(normalized);

  if (!id) {
    return;
  }

  if (
    playlist.tracks.some(
      item =>
        key(item) === id
    )
  ) {
    toast(
      "already in playlist"
    );

    return;
  }

  playlist.tracks.push(
    normalized
  );

  save();

  renderPlaylists();
  renderPlaylistPicker();

  if (
    state.currentPlaylist ===
    playlist.id
  ) {
    renderPlaylist();
  }

  toast(
    "added to playlist"
  );
}

function openPlaylistPicker(
  track
) {
  state.pickerTrack =
    normalizeTrack(track);

  renderPlaylistPicker();

  const picker =
    $("#playlistPicker");

  if (picker) {
    picker.classList.remove(
      "hidden"
    );
  }
}

function closePlaylistPicker() {
  const picker =
    $("#playlistPicker");

  if (picker) {
    picker.classList.add(
      "hidden"
    );
  }

  state.pickerTrack =
    null;
}
function renderPlaylistPicker() {
  const container =
    $("#playlistPickerList");

  if (!container) {
    return;
  }

  if (
    !state.playlists.length
  ) {
    container.innerHTML = `
      <div class="empty-state">
        no playlists yet.
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.playlists
      .map(
        (
          playlist,
          index
        ) => `
          <button
            class="playlist-picker-item"
            type="button"
            data-index="${index}"
          >
            <i
              data-lucide="list-music"
            ></i>

            <span>
              ${escapeHtml(
                playlist.name
              )}
            </span>
          </button>
        `
      )
      .join("");

  container
    .querySelectorAll(
      ".playlist-picker-item"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const playlist =
            state.playlists[
              Number(
                button.dataset
                  .index
              )
            ];

          const track =
            state.pickerTrack;

          if (
            !playlist ||
            !track
          ) {
            return;
          }

          addToPlaylist(
            playlist.id,
            track
          );

          closePlaylistPicker();
        }
      );
    });

  refreshIcons();
}

function searchItemType(
  item
) {
  const type =
    String(
      item?.resultType ||
      item?.type ||
      item?.category ||
      ""
    ).toLowerCase();

  if (
    type === "artist"
  ) {
    return "artist";
  }

  if (
    type === "album"
  ) {
    return "album";
  }

  if (
    type === "song" ||
    type === "video" ||
    type === "track"
  ) {
    return "track";
  }

  if (
    item?.videoId ||
    item?.trackId
  ) {
    return "track";
  }

  return "other";
}

function groupSearchResults(
  items
) {
  const grouped = {
    tracks: [],
    artists: [],
    albums: []
  };

  for (
    const item
    of items || []
  ) {
    const type =
      searchItemType(
        item
      );

    if (
      type === "artist"
    ) {
      grouped.artists.push(
        item
      );

      continue;
    }

    if (
      type === "album"
    ) {
      grouped.albums.push(
        item
      );

      continue;
    }

    if (
      type === "track"
    ) {
      const track =
        normalizeTrack(
          item
        );

      if (key(track)) {
        grouped.tracks.push(
          track
        );
      }
    }
  }

  return grouped;
}

function artistId(
  artist
) {
  return String(
    artist?.browseId ||
    artist?.artistId ||
    artist?.channelId ||
    artist?.id ||
    ""
  );
}

function artistName(
  artist
) {
  return String(
    artist?.name ||
    artist?.title ||
    artist?.artist ||
    artist?.author ||
    "unknown artist"
  );
}

function artistImage(
  artist
) {
  const thumbnails =
    artist?.thumbnails;

  if (
    Array.isArray(
      thumbnails
    ) &&
    thumbnails.length
  ) {
    const image =
      thumbnails[
        thumbnails.length - 1
      ];

    return typeof image ===
      "string"
      ? image
      : image?.url || "";
  }

  return String(
    artist?.artwork ||
    artist?.image ||
    artist?.thumbnail?.url ||
    artist?.thumbnail ||
    artist?.avatar ||
    artist?.picture ||
    ""
  );
}

function albumId(
  album
) {
  return String(
    album?.browseId ||
    album?.albumId ||
    album?.id ||
    album?.playlistId ||
    ""
  );
}

function albumName(
  album
) {
  return String(
    album?.title ||
    album?.name ||
    album?.album?.title ||
    album?.album?.name ||
    "unknown album"
  );
}

function albumArtist(
  album
) {
  if (
    Array.isArray(
      album?.artists
    )
  ) {
    const names =
      album.artists
        .map(artist =>
          typeof artist ===
            "string"
            ? artist
            : artist?.name
        )
        .filter(Boolean);

    if (names.length) {
      return names.join(
        ", "
      );
    }
  }

  return String(
    album?.artist ||
    album?.artistName ||
    album?.author ||
    ""
  );
}

function albumImage(
  album
) {
  const thumbnails =
    album?.thumbnails;

  if (
    Array.isArray(
      thumbnails
    ) &&
    thumbnails.length
  ) {
    const image =
      thumbnails[
        thumbnails.length - 1
      ];

    return typeof image ===
      "string"
      ? image
      : image?.url || "";
  }

  return String(
    album?.artwork ||
    album?.cover ||
    album?.image ||
    album?.thumbnail?.url ||
    album?.thumbnail ||
    ""
  );
}

function albumYear(
  album
) {
  return String(
    album?.year ||
    album?.releaseYear ||
    album?.release_year ||
    album?.date ||
    ""
  );
}

function getAlbumList(
  data
) {
  const candidates = [
    data?.albums,
    data?.discography,
    data?.releases,
    data?.artist?.albums,
    data?.artist?.discography,
    data?.artist?.releases,
    data?.data?.albums,
    data?.data?.discography,
    data?.data?.releases,
    data?.results?.albums,
    data?.sections?.albums
  ];

  for (
    const candidate
    of candidates
  ) {
    if (
      Array.isArray(
        candidate
      )
    ) {
      return candidate.filter(
        album =>
          album &&
          albumId(album)
      );
    }

    if (
      candidate &&
      typeof candidate ===
        "object"
    ) {
      const nested =
        candidate?.items ||
        candidate?.results ||
        candidate?.albums ||
        candidate?.releases;

      if (
        Array.isArray(
          nested
        )
      ) {
        return nested.filter(
          album =>
            album &&
            albumId(album)
        );
      }
    }
  }

  return [];
}

function searchArtistCard(
  artist,
  index
) {
  const image =
    artistImage(
      artist
    );

  return `
    <button
      class="search-artist-card"
      type="button"
      data-artist-index="${index}"
    >
      <div class="search-artist-image">
        ${
          image
            ? `
              <img
                src="${escapeHtml(
                  image
                )}"
                alt=""
                loading="lazy"
              >
            `
            : `
              <div class="search-artist-placeholder">
                <i
                  data-lucide="user-round"
                ></i>
              </div>
            `
        }
      </div>

      <div class="search-card-info">
        <div class="search-card-title">
          ${escapeHtml(
            artistName(
              artist
            )
          )}
        </div>

        <div class="search-card-subtitle">
          artist
        </div>
      </div>
    </button>
  `;
}

function searchAlbumCard(
  album,
  index
) {
  const image =
    albumImage(
      album
    );

  return `
    <button
      class="search-album-card"
      type="button"
      data-album-index="${index}"
    >
      ${
        image
          ? `
            <img
              src="${escapeHtml(
                image
              )}"
              alt=""
              loading="lazy"
            >
          `
          : `
            <div class="search-album-placeholder">
              <i
                data-lucide="disc-3"
              ></i>
            </div>
          `
      }

      <div class="search-card-info">
        <div class="search-card-title">
          ${escapeHtml(
            albumName(
              album
            )
          )}
        </div>

        <div class="search-card-subtitle">
          ${escapeHtml(
            albumArtist(
              album
            ) ||
            "album"
          )}
        </div>
      </div>
    </button>
  `;
}

function setSearchStatus(
  message
) {
  const status =
    $("#searchStatus");

  if (status) {
    status.textContent =
      message;
  }
}

function renderSearch() {
  const container =
    $("#searchResults");

  if (!container) {
    return;
  }

  if (
    !state.results.length &&
    !state.artists.length &&
    !state.albums.length
  ) {
    container.innerHTML = `
      <div class="empty-state">
        search for something.
      </div>
    `;

    return;
  }

  let html = "";

  if (
    state.results.length
  ) {
    html += `
      <section class="search-group">
        <h2>
          songs
        </h2>

        <div
          class="search-track-list"
          id="searchTrackList"
        >
          ${state.results
            .map(
              (
                track,
                index
              ) =>
                trackRow(
                  track,
                  index
                )
            )
            .join("")}
        </div>
      </section>
    `;
  }

  if (
    state.artists.length
  ) {
    html += `
      <section class="search-group">
        <h2>
          artists
        </h2>

        <div class="search-artist-grid">
          ${state.artists
            .map(
              searchArtistCard
            )
            .join("")}
        </div>
      </section>
    `;
  }

  if (
    state.albums.length
  ) {
    html += `
      <section class="search-group">
        <h2>
          albums
        </h2>

        <div class="search-album-grid">
          ${state.albums
            .map(
              searchAlbumCard
            )
            .join("")}
        </div>
      </section>
    `;
  }

  container.innerHTML =
    html;

  const tracks =
    $("#searchTrackList");

  if (
    tracks &&
    state.results.length
  ) {
    bindTrackRows(
      tracks,
      state.results,
      "search",
      {
        rerender:
          renderSearch
      }
    );
  }

  container
    .querySelectorAll(
      "[data-artist-index]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const artist =
            state.artists[
              Number(
                button.dataset
                  .artistIndex
              )
            ];

          if (artist) {
            openArtist(
              artist
            );
          }
        }
      );
    });

  container
    .querySelectorAll(
      "[data-album-index]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const album =
            state.albums[
              Number(
                button.dataset
                  .albumIndex
              )
            ];

          if (album) {
            openAlbum(
              album
            );
          }
        }
      );
    });

  refreshIcons();
}

async function requestJson(
  url,
  options
) {
  const response =
    await fetch(
      url,
      options
    );

  const text =
    await response.text();

  let data = null;

  if (text) {
    try {
      data =
        JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data?.error ||
      data?.message ||
      text ||
      `request failed (${response.status})`;

    throw new Error(
      message
    );
  }

  return data;
}

async function searchMusic(
  query
) {
  const value =
    String(
      query || ""
    ).trim();

  if (!value) {
    state.results = [];
    state.artists = [];
    state.albums = [];

    setSearchStatus("");

    renderSearch();

    return;
  }

  setSearchStatus(
    "searching..."
  );

  try {
    const data =
      await requestJson(
        `/api/music/search?q=${encodeURIComponent(
          value
        )}`
      );

    const items =
      Array.isArray(data)
        ? data
        : Array.isArray(
            data?.items
          )
          ? data.items
          : Array.isArray(
              data?.results
            )
            ? data.results
            : [];

    const grouped =
      groupSearchResults(
        items
      );

    state.results =
      grouped.tracks;

    state.artists =
      grouped.artists;

    state.albums =
      grouped.albums;

    state.searchSource =
      data?.source ||
      items.find(
        item =>
          item?.source ||
          item?.provider
      )?.source ||
      items.find(
        item =>
          item?.source ||
          item?.provider
      )?.provider ||
      state.searchSource ||
      "youtube";

    const count =
      state.results.length +
      state.artists.length +
      state.albums.length;

    setSearchStatus(
      count
        ? ""
        : "no results found."
    );

    renderSearch();
  } catch (error) {
    state.results = [];
    state.artists = [];
    state.albums = [];

    setSearchStatus(
      error?.message ||
      "search failed."
    );

    renderSearch();
  }
}

function getTrackList(data) {
  const candidates = [
    data?.tracks,
    data?.songs,
    data?.items,
    data?.results,
    data?.topSongs,
    data?.top_songs,
    data?.topTracks,
    data?.top_tracks,
    data?.popular,
    data?.top,
    data?.collection,
    data?.artist?.tracks,
    data?.artist?.songs,
    data?.artist?.topSongs,
    data?.artist?.topTracks,
    data?.data?.tracks,
    data?.data?.songs,
    data?.data?.items,
    data?.data?.topSongs,
    data?.data?.topTracks
  ];

  for (
    const candidate
    of candidates
  ) {
    if (
      Array.isArray(
        candidate
      )
    ) {
      const tracks =
        candidate
          .map(
            normalizeTrack
          )
          .filter(
            track =>
              key(track)
          );

      if (tracks.length) {
        return tracks;
      }
    }

    if (
      candidate &&
      typeof candidate ===
        "object"
    ) {
      const nested =
        candidate?.items ||
        candidate?.results ||
        candidate?.tracks ||
        candidate?.songs;

      if (
        Array.isArray(
          nested
        )
      ) {
        const tracks =
          nested
            .map(
              normalizeTrack
            )
            .filter(
              track =>
                key(track)
            );

        if (tracks.length) {
          return tracks;
        }
      }
    }
  }

  if (
    Array.isArray(data)
  ) {
    return data
      .map(
        normalizeTrack
      )
      .filter(
        track =>
          key(track)
      );
  }

  return [];
}

function getArtistDescription(
  data,
  detail
) {
  const value =
    detail?.description ||
    detail?.bio ||
    detail?.biography ||
    detail?.about ||
    data?.description ||
    data?.bio ||
    data?.biography ||
    data?.about ||
    data?.artist?.description ||
    data?.artist?.bio ||
    data?.data?.description ||
    data?.data?.bio ||
    "";

  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  if (
    typeof value?.text ===
    "string"
  ) {
    return value.text;
  }

  if (
    Array.isArray(
      value?.runs
    )
  ) {
    return value.runs
      .map(
        run =>
          run?.text || ""
      )
      .join("");
  }

  return "";
}

function uniqueTracks(
  tracks
) {
  const seen =
    new Set();

  const result = [];

  for (
    const value
    of tracks || []
  ) {
    const track =
      normalizeTrack(
        value
      );

    const id =
      key(track);

    if (
      !id ||
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    result.push(track);
  }

  return result;
}

function uniqueAlbums(
  albums
) {
  const seen =
    new Set();

  const result = [];

  for (
    const album
    of albums || []
  ) {
    const id =
      albumId(album);

    if (
      !id ||
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    result.push(album);
  }

  return result;
}

function collectArtistTracks(
  data
) {
  const candidates = [
    data?.tracks,
    data?.songs,
    data?.topSongs,
    data?.top_songs,
    data?.topTracks,
    data?.top_tracks,
    data?.popular,
    data?.top,
    data?.artist?.tracks,
    data?.artist?.songs,
    data?.artist?.topSongs,
    data?.artist?.top_songs,
    data?.artist?.topTracks,
    data?.artist?.top_tracks,
    data?.artist?.popular,
    data?.data?.tracks,
    data?.data?.songs,
    data?.data?.topSongs,
    data?.data?.top_songs,
    data?.data?.topTracks,
    data?.data?.top_tracks,
    data?.data?.popular
  ];

  const collected = [];

  for (
    const candidate
    of candidates
  ) {
    if (
      Array.isArray(
        candidate
      )
    ) {
      collected.push(
        ...candidate
      );

      continue;
    }

    if (
      candidate &&
      typeof candidate ===
        "object"
    ) {
      const nested =
        candidate?.items ||
        candidate?.results ||
        candidate?.tracks ||
        candidate?.songs;

      if (
        Array.isArray(
          nested
        )
      ) {
        collected.push(
          ...nested
        );
      }
    }
  }

  if (!collected.length) {
    collected.push(
      ...getTrackList(
        data
      )
    );
  }

  return uniqueTracks(
    collected
  ).slice(
    0,
    10
  );
}

function collectArtistAlbums(
  data
) {
  const candidates = [
    data?.albums,
    data?.discography,
    data?.releases,
    data?.singles,
    data?.eps,
    data?.artist?.albums,
    data?.artist?.discography,
    data?.artist?.releases,
    data?.artist?.singles,
    data?.artist?.eps,
    data?.data?.albums,
    data?.data?.discography,
    data?.data?.releases,
    data?.data?.singles,
    data?.data?.eps,
    data?.results?.albums,
    data?.sections?.albums
  ];

  const collected = [];

  for (
    const candidate
    of candidates
  ) {
    if (
      Array.isArray(
        candidate
      )
    ) {
      collected.push(
        ...candidate
      );

      continue;
    }

    if (
      candidate &&
      typeof candidate ===
        "object"
    ) {
      const nested =
        candidate?.items ||
        candidate?.results ||
        candidate?.albums ||
        candidate?.releases ||
        candidate?.singles;

      if (
        Array.isArray(
          nested
        )
      ) {
        collected.push(
          ...nested
        );
      }
    }
  }

  if (!collected.length) {
    collected.push(
      ...getAlbumList(
        data
      )
    );
  }

  return uniqueAlbums(
    collected
  );
}

function ensureDetailView(
  type
) {
  const id =
    `${type}View`;

  let view =
    document.getElementById(
      id
    );

  if (view) {
    view.dataset.view =
      type;

    return view;
  }

  view =
    document.createElement(
      "section"
    );

  view.id =
    id;

  view.className =
    "view hidden";

  view.dataset.view =
    type;

  const content =
    document.querySelector(
      ".content"
    ) ||
    document.querySelector(
      ".main-content"
    ) ||
    document.querySelector(
      "main"
    );

  if (!content) {
    return null;
  }

  content.appendChild(
    view
  );

  return view;
}

function artistAlbumCard(
  album,
  index
) {
  const image =
    albumImage(
      album
    );

  const year =
    albumYear(
      album
    );

  return `
    <button
      class="search-album-card artist-album-card"
      type="button"
      data-artist-album-index="${index}"
    >
      ${
        image
          ? `
            <img
              src="${escapeHtml(
                image
              )}"
              alt=""
              loading="lazy"
            >
          `
          : `
            <div class="search-album-placeholder">
              <i
                data-lucide="disc-3"
              ></i>
            </div>
          `
      }

      <div class="search-card-info">
        <div class="search-card-title">
          ${escapeHtml(
            albumName(
              album
            )
          )}
        </div>

        <div class="search-card-subtitle">
          ${escapeHtml(
            year ||
            albumArtist(
              album
            ) ||
            "album"
          )}
        </div>
      </div>
    </button>
  `;
}

async function openArtist(
  artist
) {
  const id =
    artistId(
      artist
    );

  if (!id) {
    toast(
      "artist unavailable"
    );

    return;
  }

  const view =
    ensureDetailView(
      "artist"
    );

  if (!view) {
    return;
  }

  view.innerHTML = `
    <div class="detail-page">
      <button
        class="detail-back"
        type="button"
        id="artistBack"
      >
        <i
          data-lucide="arrow-left"
        ></i>
        back
      </button>

      <div class="detail-loading">
        loading artist...
      </div>
    </div>
  `;

  setView(
    "artist"
  );

  $("#artistBack")
    ?.addEventListener(
      "click",
      () =>
        setView(
          "search"
        )
    );

  refreshIcons();

  try {
    const data =
      await requestJson(
        `/api/music/artist/${encodeURIComponent(
          id
        )}`
      );

    const detail =
      data?.artist ||
      data?.data?.artist ||
      data?.data ||
      data ||
      artist;

    const tracks =
      collectArtistTracks(
        data
      );

    const albums =
      collectArtistAlbums(
        data
      );

    const name =
      artistName(
        detail
      ) !==
      "unknown artist"
        ? artistName(
            detail
          )
        : artistName(
            artist
          );

    const image =
      artistImage(
        detail
      ) ||
      artistImage(
        data
      ) ||
      artistImage(
        artist
      );

    const description =
      getArtistDescription(
        data,
        detail
      );

    view.innerHTML = `
      <div class="detail-page">
        <button
          class="detail-back"
          type="button"
          id="artistBack"
        >
          <i
            data-lucide="arrow-left"
          ></i>
          back
        </button>

        <header class="detail-header">
          <div
            class="detail-cover detail-artist-cover"
          >
            ${
              image
                ? `
                  <img
                    src="${escapeHtml(
                      image
                    )}"
                    alt=""
                  >
                `
                : `
                  <i
                    data-lucide="user-round"
                  ></i>
                `
            }
          </div>

          <div class="detail-header-info">
            <div class="detail-type">
              artist
            </div>

            <h1>
              ${escapeHtml(
                name
              )}
            </h1>

            ${
              description
                ? `
                  <p class="detail-description">
                    ${escapeHtml(
                      description
                    )}
                  </p>
                `
                : ""
            }
          </div>
        </header>

        <section class="detail-section">
          <h2>
            top songs
          </h2>

          <div
            id="artistTracks"
            class="search-track-list"
          >
            ${
              tracks.length
                ? tracks
                    .map(
                      (
                        track,
                        index
                      ) =>
                        trackRow(
                          track,
                          index
                        )
                    )
                    .join("")
                : `
                  <div class="empty-state">
                    no songs found.
                  </div>
                `
            }
          </div>
        </section>

        <section class="detail-section">
          <h2>
            discography
          </h2>

          <div
            id="artistAlbums"
            class="search-album-grid"
          >
            ${
              albums.length
                ? albums
                    .map(
                      artistAlbumCard
                    )
                    .join("")
                : `
                  <div class="empty-state">
                    no albums found.
                  </div>
                `
            }
          </div>
        </section>
      </div>
    `;

    setView(
      "artist"
    );

    $("#artistBack")
      ?.addEventListener(
        "click",
        () =>
          setView(
            "search"
          )
      );

    const trackContainer =
      $("#artistTracks");

    if (
      trackContainer &&
      tracks.length
    ) {
      bindTrackRows(
        trackContainer,
        tracks,
        `artist:${id}`
      );
    }

    const albumContainer =
      $("#artistAlbums");

    if (
      albumContainer &&
      albums.length
    ) {
      albumContainer
        .querySelectorAll(
          "[data-artist-album-index]"
        )
        .forEach(
          button => {
            button.addEventListener(
              "click",
              () => {
                const album =
                  albums[
                    Number(
                      button.dataset
                        .artistAlbumIndex
                    )
                  ];

                if (album) {
                  openAlbum(
                    album,
                    {
                      back: "artist",
                      artist
                    }
                  );
                }
              }
            );
          }
        );
    }

    refreshIcons();
  } catch (error) {
    view.innerHTML = `
      <div class="detail-page">
        <button
          class="detail-back"
          type="button"
          id="artistBack"
        >
          <i
            data-lucide="arrow-left"
          ></i>
          back
        </button>

        <div class="empty-state">
          ${escapeHtml(
            error?.message ||
            "could not load artist"
          )}
        </div>
      </div>
    `;

    setView(
      "artist"
    );

    $("#artistBack")
      ?.addEventListener(
        "click",
        () =>
          setView(
            "search"
          )
      );

    refreshIcons();
  }
}

async function openAlbum(
  album,
  options = {}
) {
  const id =
    albumId(
      album
    );

  if (!id) {
    toast(
      "album unavailable"
    );

    return;
  }

  const view =
    ensureDetailView(
      "album"
    );

  if (!view) {
    return;
  }

  const backView =
    options.back ||
    "search";

  const back = () => {
    if (
      backView ===
        "artist" &&
      options.artist
    ) {
      setView(
        "artist"
      );

      return;
    }

    setView(
      backView
    );
  };

  view.innerHTML = `
    <div class="detail-page">
      <button
        class="detail-back"
        type="button"
        id="albumBack"
      >
        <i
          data-lucide="arrow-left"
        ></i>
        back
      </button>

      <div class="detail-loading">
        loading album...
      </div>
    </div>
  `;

  setView(
    "album"
  );

  $("#albumBack")
    ?.addEventListener(
      "click",
      back
    );

  refreshIcons();

  try {
    const data =
      await requestJson(
        `/api/music/album/${encodeURIComponent(
          id
        )}`
      );

    const detail =
      data?.album ||
      data?.data?.album ||
      data?.data ||
      data ||
      album;

    const tracks =
      getTrackList(
        data
      );

    const name =
      albumName(
        detail
      ) !==
      "unknown album"
        ? albumName(
            detail
          )
        : albumName(
            album
          );

    const artistNameValue =
      albumArtist(
        detail
      ) ||
      albumArtist(
        album
      );

    const image =
      albumImage(
        detail
      ) ||
      albumImage(
        album
      );

    const albumTracks =
      tracks.map(track => ({
        ...track,
        thumbnails: [],
        thumbnail: "",
        artwork: image,
        cover: image,
        image
      }));

    const year =
      albumYear(
        detail
      ) ||
      albumYear(
        album
      );

    view.innerHTML = `
      <div class="detail-page">
        <button
          class="detail-back"
          type="button"
          id="albumBack"
        >
          <i
            data-lucide="arrow-left"
          ></i>
          back
        </button>

        <header class="detail-header">
          <div class="detail-cover">
            ${
              image
                ? `
                  <img
                    src="${escapeHtml(
                      image
                    )}"
                    alt=""
                  >
                `
                : `
                  <i
                    data-lucide="disc-3"
                  ></i>
                `
            }
          </div>

          <div class="detail-header-info">
            <div class="detail-type">
              album
            </div>

            <h1>
              ${escapeHtml(
                name
              )}
            </h1>

            ${
              artistNameValue
                ? `
                  <div class="detail-subtitle">
                    ${escapeHtml(
                      artistNameValue
                    )}
                  </div>
                `
                : ""
            }

            ${
              year
                ? `
                  <div class="detail-meta">
                    ${escapeHtml(
                      year
                    )}
                  </div>
                `
                : ""
            }
          </div>
        </header>

        <section class="detail-section">
          <h2>
            songs
          </h2>

          <div
            id="albumTracks"
            class="search-track-list"
          >
            ${
              albumTracks.length
                ? albumTracks
                    .map(
                      (
                        track,
                        index
                      ) =>
                        trackRow(
                          track,
                          index
                        )
                    )
                    .join("")
                : `
                  <div class="empty-state">
                    no songs found.
                  </div>
                `
            }
          </div>
        </section>
      </div>
    `;

    setView(
      "album"
    );

    $("#albumBack")
      ?.addEventListener(
        "click",
        back
      );

    const container =
      $("#albumTracks");

    if (
      container &&
      albumTracks.length
    ) {
      bindTrackRows(
        container,
        albumTracks,
        `album:${id}`
      );
    }

    refreshIcons();
  } catch (error) {
    view.innerHTML = `
      <div class="detail-page">
        <button
          class="detail-back"
          type="button"
          id="albumBack"
        >
          <i
            data-lucide="arrow-left"
          ></i>
          back
        </button>

        <div class="empty-state">
          ${escapeHtml(
            error?.message ||
            "could not load album"
          )}
        </div>
      </div>
    `;

    setView(
      "album"
    );

    $("#albumBack")
      ?.addEventListener(
        "click",
        back
      );

    refreshIcons();
  }
}

function streamUrl(
  track
) {
  const id =
    key(track);

  if (!id) {
    return "";
  }

  const source =
    String(
      track?.source ||
      track?.provider ||
      state.searchSource ||
      "youtube"
    ).toLowerCase();

  return `/api/music/stream/${encodeURIComponent(
    id
  )}?source=${encodeURIComponent(
    source
  )}`;
}

async function playTrack(
  track
) {
  const normalized =
    normalizeTrack(
      track
    );

  const id =
    key(normalized);

  if (!id) {
    toast(
      "song unavailable"
    );

    return;
  }

  const artwork =
    trackArtwork(track) ||
    trackArtwork(normalized);

  if (artwork) {
    normalized.artwork =
      artwork;

    normalized.cover =
      artwork;

    normalized.image =
      artwork;
  }

  state.current =
    normalized;

  if (
    !state.playbackList
      .length
  ) {
    state.playbackList = [
      normalized
    ];

    state.index = 0;
  } else if (
    state.index >= 0 &&
    state.index <
      state.playbackList.length
  ) {
    state.playbackList[
      state.index
    ] = normalized;
  }

  addRecent(
    normalized
  );

  updatePlayer();

  const url =
    streamUrl(
      normalized
    );

  if (!url) {
    toast(
      "song unavailable"
    );

    return;
  }

  if (
    audio.src !==
    new URL(
      url,
      location.href
    ).href
  ) {
    audio.src =
      url;

    audio.load();
  }

  try {
    await audio.play();
  } catch {
    toast(
      "could not play song"
    );
  }

  updatePlayButton();
}

function openLyrics() {
  setView(
    "lyrics"
  );

  loadLyrics();
}

function parseLyrics(
  data
) {
  const source =
    data?.syncedLyrics ||
    data?.synced ||
    data?.lyrics ||
    data?.plainLyrics ||
    data?.text ||
    "";

  if (
    Array.isArray(source)
  ) {
    return source
      .map(
        item => ({
          time:
            Number(
              item?.time ??
              item?.start ??
              item?.timestamp ??
              0
            ),
          text:
            String(
              item?.text ||
              item?.line ||
              item?.lyrics ||
              ""
            )
        })
      )
      .filter(
        line =>
          line.text
      );
  }

  if (
    typeof source !==
    "string"
  ) {
    return [];
  }

  const lines =
    source.split(
      /\r?\n/
    );

  const result = [];

  for (
    const line
    of lines
  ) {
    const match =
      line.match(
        /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/
      );

    if (match) {
      result.push({
        time:
          Number(
            match[1]
          ) *
            60 +
          Number(
            match[2]
          ),
        text:
          match[3].trim()
      });

      continue;
    }

    const text =
      line.trim();

    if (text) {
      result.push({
        time: -1,
        text
      });
    }
  }

  return result;
}

async function loadLyrics() {
  const container =
    $("#lyricsContent");

  if (!container) {
    return;
  }

  if (!state.current) {
    container.innerHTML = `
      <div class="empty-state">
        play a song first.
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <div class="detail-loading">
      loading lyrics...
    </div>
  `;

  const track =
    state.current;

  const id =
    key(track);

  try {
    const params =
      new URLSearchParams();

    params.set(
      "title",
      trackTitle(track)
    );

    params.set(
      "artist",
      trackArtist(track)
    );

    const duration =
      trackDuration(
        track
      );

    if (duration) {
      params.set(
        "duration",
        String(duration)
      );
    }

    const data =
      await requestJson(
        `/api/music/lyrics/${encodeURIComponent(
          id
        )}?${params.toString()}`
      );

    state.lyrics =
      parseLyrics(
        data
      );

    state.lyricIndex =
      -1;

    renderLyrics();
  } catch (error) {
    state.lyrics = [];

    state.lyricIndex =
      -1;

    container.innerHTML = `
      <div class="empty-state">
        ${escapeHtml(
          error?.message ||
          "lyrics unavailable"
        )}
      </div>
    `;
  }
}

function renderLyrics() {
  const container =
    $("#lyricsContent");

  if (!container) {
    return;
  }

  if (
    !state.lyrics.length
  ) {
    container.innerHTML = `
      <div class="empty-state">
        lyrics unavailable.
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.lyrics
      .map(
        (
          line,
          index
        ) => `
          <div
            class="lyric-line"
            data-lyric-index="${index}"
          >
            ${escapeHtml(
              line.text
            )}
          </div>
        `
      )
      .join("");

  container
    .querySelectorAll(
      ".lyric-line"
    )
    .forEach(element => {
      element.addEventListener(
        "click",
        () => {
          const line =
            state.lyrics[
              Number(
                element.dataset
                  .lyricIndex
              )
            ];

          if (
            line &&
            line.time >= 0
          ) {
            audio.currentTime =
              line.time;
          }
        }
      );
    });

  updateActiveLyric();
}

function updateActiveLyric() {
  if (
    !state.lyrics.length
  ) {
    return;
  }

  let index = -1;

  for (
    let i = 0;
    i <
    state.lyrics.length;
    i++
  ) {
    const line =
      state.lyrics[i];

    if (
      line.time < 0
    ) {
      continue;
    }

    if (
      line.time <=
      audio.currentTime
    ) {
      index = i;
    } else {
      break;
    }
  }

  if (
    index ===
    state.lyricIndex
  ) {
    return;
  }

  state.lyricIndex =
    index;

  $$(".lyric-line")
    .forEach(
      (
        element,
        lineIndex
      ) => {
        element.classList.toggle(
          "active",
          lineIndex ===
            index
        );
      }
    );

  if (index >= 0) {
    const element =
      document.querySelector(
        `[data-lyric-index="${index}"]`
      );

    element?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

async function fillQueueFromRecommendations() {
  if (!state.current) {
    return;
  }

  const id =
    key(
      state.current
    );

  if (!id) {
    return;
  }

  try {
    const data =
      await requestJson(
        `/api/music/recommendations/queue/${encodeURIComponent(
          id
        )}`
      );

    const recommendations =
      getTrackList(
        data
      );

    const existing =
      new Set(
        state.queue.map(
          key
        )
      );

    for (
      const track
      of recommendations
    ) {
      const trackId =
        key(track);

      if (
        !trackId ||
        existing.has(
          trackId
        ) ||
        trackId ===
          key(
            state.current
          )
      ) {
        continue;
      }

      existing.add(
        trackId
      );

      let queueTrack =
        normalizeTrack(
          track
        );

      try {
        const query =
          `${trackTitle(track)} ${trackArtist(track)}`;

        const searchData =
          await requestJson(
            `/api/music/search?q=${encodeURIComponent(
              query
            )}`
          );

        const items =
          Array.isArray(
            searchData
          )
            ? searchData
            : Array.isArray(
                searchData?.items
              )
              ? searchData.items
              : Array.isArray(
                  searchData?.results
                )
                ? searchData.results
                : [];

        const grouped =
          groupSearchResults(
            items
          );

        const exact =
          grouped.tracks.find(
            item =>
              key(item) ===
              trackId
          );

        const titleMatch =
          grouped.tracks.find(
            item =>
              trackTitle(item)
                .toLowerCase() ===
              trackTitle(track)
                .toLowerCase()
          );

        const found =
          exact ||
          titleMatch ||
          grouped.tracks[0];

        if (found) {
          queueTrack =
            normalizeTrack(
              found
            );
        }
      } catch {}

      state.queue.push(
        queueTrack
      );
    }

    save();

    renderQueue();
  } catch {}
}

async function handleEnded() {
  if (
    state.playbackList
      .length &&
    state.index + 1 <
      state.playbackList
        .length
  ) {
    state.index += 1;

    playTrack(
      state.playbackList[
        state.index
      ]
    );

    return;
  }

  if (
    !state.queue.length
  ) {
    await fillQueueFromRecommendations();
  }

  if (
    state.queue.length
  ) {
    const next =
      state.queue.shift();

    save();

    renderQueue();

    state.playbackList = [
      normalizeTrack(
        next
      )
    ];

    state.index = 0;

    state.playbackSource =
      "queue";

    playTrack(
      next
    );

    return;
  }

  updatePlayButton();
}

function handleAudioError() {
  if (!state.current) {
    return;
  }

  toast(
    "could not play song"
  );

  updatePlayButton();
}

function setupNavigation() {
  $$(".nav-link")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const view =
            button.dataset.view;

          if (!view) {
            return;
          }

          if (
            view ===
            "lyrics"
          ) {
            openLyrics();

            return;
          }

          setView(view);
        }
      );
    });

  $$("[data-view]")
    .filter(
      button =>
        !button.classList.contains(
          "nav-link"
        ) &&
        button.tagName ===
          "BUTTON"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const view =
            button.dataset.view;

          if (!view) {
            return;
          }

          if (
            view ===
            "lyrics"
          ) {
            openLyrics();

            return;
          }

          setView(view);
        }
      );
    });
}

function setupSearch() {
  const input =
    $("#searchInput");

  if (!input) {
    return;
  }

  let timer = null;

  input.addEventListener(
    "keydown",
    event => {
      if (
        event.key ===
        "Enter"
      ) {
        clearTimeout(
          timer
        );

        searchMusic(
          input.value
        );
      }
    }
  );

  input.addEventListener(
    "input",
    () => {
      clearTimeout(
        timer
      );

      const query =
        input.value.trim();

      if (!query) {
        state.results = [];
        state.artists = [];
        state.albums = [];

        setSearchStatus("");

        renderSearch();

        return;
      }

      timer =
        setTimeout(
          () => {
            searchMusic(
              query
            );
          },
          450
        );
    }
  );
}

function setupPlayer() {
  $("#playBtn")
    ?.addEventListener(
      "click",
      togglePlay
    );

  $("#nextBtn")
    ?.addEventListener(
      "click",
      nextTrack
    );

  $("#prevBtn")
    ?.addEventListener(
      "click",
      previousTrack
    );

  $("#likeBtn")
    ?.addEventListener(
      "click",
      () => {
        if (
          state.current
        ) {
          toggleLike(
            state.current
          );
        }
      }
    );

  $("#playlistBtn")
    ?.addEventListener(
      "click",
      () => {
        if (
          state.current
        ) {
          openPlaylistPicker(
            state.current
          );
        } else {
          setView(
            "playlists"
          );
        }
      }
    );

  $("#lyricsBtn")
    ?.addEventListener(
      "click",
      openLyrics
    );

  $("#muteBtn")
    ?.addEventListener(
      "click",
      toggleMute
    );

  $("#progress")
    ?.addEventListener(
      "input",
      seekFromProgress
    );

  $("#volume")
    ?.addEventListener(
      "input",
      updateVolume
    );

  if (!audio) {
    return;
  }

  audio.addEventListener(
    "play",
    updatePlayButton
  );

  audio.addEventListener(
    "pause",
    updatePlayButton
  );

  audio.addEventListener(
    "loadedmetadata",
    updateProgress
  );

  audio.addEventListener(
    "durationchange",
    updateProgress
  );

  audio.addEventListener(
    "timeupdate",
    () => {
      updateProgress();
      updateActiveLyric();
    }
  );

  audio.addEventListener(
    "volumechange",
    updateMuteButton
  );

  audio.addEventListener(
    "ended",
    handleEnded
  );

  audio.addEventListener(
    "error",
    handleAudioError
  );
}

function setupPlaylists() {
  $("#createPlaylistBtn")
    ?.addEventListener(
      "click",
      createPlaylist
    );

  $("#pickerCreatePlaylist")
    ?.addEventListener(
      "click",
      () => {
        const track =
          state.pickerTrack;

        closePlaylistPicker();

        const name =
          prompt(
            "playlist name"
          );

        if (
          !name ||
          !name.trim()
        ) {
          return;
        }

        const playlist = {
          id: `playlist-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`,
          name:
            name.trim(),
          tracks: []
        };

        state.playlists.unshift(
          playlist
        );

        save();

        if (track) {
          addToPlaylist(
            playlist.id,
            track
          );
        }

        renderPlaylists();
        renderPlaylistPicker();

        toast(
          "playlist created"
        );
      }
    );

  $("#closePlaylistPicker")
    ?.addEventListener(
      "click",
      closePlaylistPicker
    );

  $("#playlistPicker")
    ?.addEventListener(
      "click",
      event => {
        if (
          event.target.id ===
          "playlistPicker"
        ) {
          closePlaylistPicker();
        }
      }
    );

  $("#backToPlaylists")
    ?.addEventListener(
      "click",
      () =>
        setView(
          "playlists"
        )
    );

  $("#deletePlaylistBtn")
    ?.addEventListener(
      "click",
      deleteCurrentPlaylist
    );

  $("#clearQueueBtn")
    ?.addEventListener(
      "click",
      clearQueue
    );
}

function setupLyrics() {
  $("#lyricsClose")
    ?.addEventListener(
      "click",
      () =>
        setView(
          "home"
        )
    );
}

function setupKeyboard() {
  document.addEventListener(
    "keydown",
    event => {
      const target =
        event.target;

      if (
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      if (
        event.code ===
        "Space"
      ) {
        event.preventDefault();

        togglePlay();

        return;
      }

      if (
        event.code ===
          "ArrowRight" &&
        event.altKey
      ) {
        event.preventDefault();

        nextTrack();

        return;
      }

      if (
        event.code ===
          "ArrowLeft" &&
        event.altKey
      ) {
        event.preventDefault();

        previousTrack();
      }
    }
  );
}

function setupImages() {
  document.addEventListener(
    "error",
    event => {
      const target =
        event.target;

      if (
        !(
          target instanceof
          HTMLImageElement
        )
      ) {
        return;
      }

      if (
        target.dataset
          .imageFailed ===
        "true"
      ) {
        return;
      }

      target.dataset
        .imageFailed =
        "true";

      target.style.opacity =
        "0";
    },
    true
  );
}

function setupSource() {
  fetch(
    "/api/music/source"
  )
    .then(response => {
      if (!response.ok) {
        return null;
      }

      return response.json();
    })
    .then(data => {
      const source =
        data?.source ||
        data?.current;

      if (source) {
        state.searchSource =
          source;
      }
    })
    .catch(
      () => {}
    );
}

function setupSeeAll() {
  $$(
    ".text-button[data-view]"
  ).forEach(button => {
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
  });
}

function setupCoverErrors() {
  const observer =
    new MutationObserver(
      mutations => {
        for (
          const mutation
          of mutations
        ) {
          for (
            const node
            of mutation.addedNodes
          ) {
            if (
              !(
                node instanceof
                HTMLElement
              )
            ) {
              continue;
            }

            const images = [
              ...(
                node.matches("img")
                  ? [node]
                  : []
              ),
              ...node.querySelectorAll(
                "img"
              )
            ];

            for (
              const image
              of images
            ) {
              if (
                image.dataset
                  .fallbackBound ===
                "true"
              ) {
                continue;
              }

              image.dataset
                .fallbackBound =
                "true";

              image.addEventListener(
                "error",
                () => {
                  image.style.opacity =
                    "0";
                }
              );
            }
          }
        }
      }
    );

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );
}

function restorePlayer() {
  if (
    state.recent.length
  ) {
    state.current =
      null;
  }

  if (audio) {
    const volume =
      $("#volume");

    const initial =
      volume
        ? Number(
            volume.value
          )
        : 0.8;

    audio.volume =
      Number.isFinite(
        initial
      )
        ? Math.max(
            0,
            Math.min(
              1,
              initial
            )
          )
        : 0.8;
  }
}

function normalizeStoredData() {
  state.queue =
    Array.isArray(
      state.queue
    )
      ? state.queue
          .map(
            normalizeTrack
          )
          .filter(
            track =>
              key(track)
          )
      : [];

  state.liked =
    Array.isArray(
      state.liked
    )
      ? state.liked
          .map(
            normalizeTrack
          )
          .filter(
            track =>
              key(track)
          )
      : [];

  state.recent =
    Array.isArray(
      state.recent
    )
      ? state.recent
          .map(
            normalizeTrack
          )
          .filter(
            track =>
              key(track)
          )
      : [];

  state.playlists =
    Array.isArray(
      state.playlists
    )
      ? state.playlists
          .filter(
            playlist =>
              playlist &&
              playlist.id
          )
          .map(
            playlist => ({
              ...playlist,
              tracks:
                Array.isArray(
                  playlist.tracks
                )
                  ? playlist.tracks
                      .map(
                        normalizeTrack
                      )
                      .filter(
                        track =>
                          key(track)
                      )
                  : []
            })
          )
      : [];
}

function init() {
  normalizeStoredData();

  restorePlayer();

  setupNavigation();
  setupSearch();
  setupPlayer();
  setupPlaylists();
  setupLyrics();
  setupKeyboard();
  setupImages();
  setupSource();
  setupSeeAll();
  setupCoverErrors();

  renderHome();
  renderLiked();
  renderRecent();
  renderQueue();
  renderPlaylists();
  renderPlaylistPicker();

  updatePlayer();
  updateProgress();
  updateMuteButton();

  const startingView =
    document.getElementById(
      `view-${state.view}`
    )
      ? state.view
      : "home";

  setView(
    startingView
  );

  refreshIcons();
}

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    init
  );
} else {
  init();
}