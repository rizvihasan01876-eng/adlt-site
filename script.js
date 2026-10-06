/* RIZVI.NET: Firebase-backed public catalog and admin dashboard. */
const firebaseConfig = {
  // Set databaseURL to the URL shown in Firebase Console > Realtime Database.
  apiKey: "AIzaSyAxNf9AVoZPxo8fRAPBdW-Y2WFvUK4BI58",
  authDomain: "rizvinet-f310d.firebaseapp.com",
  databaseURL: "https://rizvinet-f310d-default-rtdb.firebaseio.com",
  projectId: "rizvinet-f310d",
  storageBucket: "rizvinet-f310d.firebasestorage.app",
  messagingSenderId: "887192852207",
  appId: "1:887192852207:web:c2ffe8ddb61c65807d2d1a",
  measurementId: "G-4LBSYSZ5X9"
};
// Only this Firebase Authentication email is allowed into the admin dashboard.
const ADMIN_EMAIL = "rizvihasan01876@gmail.com";

// Authentication can work without Realtime Database; catalog/admin data cannot.
const firebaseReady = Boolean(window.firebase && firebaseConfig.apiKey !== "YOUR_API_KEY");
let db = null;
let auth = null;
if (firebaseReady) {
  try {
    firebase.initializeApp(firebaseConfig);
    if (firebase.auth) auth = firebase.auth();
    if (firebaseConfig.databaseURL && firebaseConfig.databaseURL !== "YOUR_DATABASE_URL") db = firebase.database();
  } catch (error) { console.error("Firebase initialization failed:", error); }
}

// Google Drive links are not guaranteed to be publicly accessible or HTML5-streamable.
function extractDriveFileId(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url.trim());
    if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname) && parsed.hostname !== "docs.google.com") return null;
    const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/) || parsed.pathname.match(/\/d\/([^/]+)/);
    const id = pathMatch ? pathMatch[1] : parsed.searchParams.get("id");
    return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
  } catch (_) { return null; }
}
function convertDriveImageUrl(url) {
  const id = extractDriveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200` : (url || "");
}
function convertDriveVideoUrl(url) {
  const id = extractDriveFileId(url);
  return id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : (url || "");
}
function convertStreamableEmbedUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url.trim());
    if (!/(^|\.)streamable\.com$/i.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(/^\/(?:e\/)?([a-zA-Z0-9]+)\/?$/);
    return match ? `https://streamable.com/e/${encodeURIComponent(match[1])}` : null;
  } catch (_) { return null; }
}
window.extractDriveFileId = extractDriveFileId;
window.convertDriveImageUrl = convertDriveImageUrl;
window.convertDriveVideoUrl = convertDriveVideoUrl;

const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const toArray = value => value ? Object.entries(value).map(([id, item]) => ({ id, ...(item || {}) })) : [];
function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("toast-error", isError);
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}
function formatDate(timestamp) {
  if (!timestamp) return "Date unknown";
  const date = new Date(Number(timestamp));
  return Number.isNaN(date.getTime()) ? "Date unknown" : date.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
}
function imageMarkup(url, alt, className = "") {
  const src = convertDriveImageUrl(url);
  if (!src) return `<div class="image-placeholder ${className}">RIZVI.NET</div>`;
  return `<img class="${className}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'image-placeholder',textContent:'RIZVI.NET'}))">`;
}
function showFirebaseSetupError(target) {
  if (target) target.innerHTML = `<div class="error-state">Firebase is not configured yet. Add your project settings in <code>script.js</code> to load the catalog.</div>`;
}

// Public catalog
const publicState = { videos: [], categories: [], selectedCategory: "", allVideosPage: 1, openedViews: new Set(), currentVideoId: null, currentPage: "home", previousPage: "home", settings: {} };
function showCatalogPage(page) {
  const validPages = ["home", "categories", "trending", "latest", "allVideos", "search"];
  page = validPages.includes(page) ? page : "home";
  publicState.currentPage = page;
  const sections = document.querySelectorAll(".content-section");
  sections.forEach(section => {
    section.hidden = page === "home"
      ? section.id === "searchSection" && !(document.getElementById("searchInput")?.value || "").trim()
      : section.id !== (page === "search" ? "searchSection" : page);
  });
  document.getElementById("heroSection").hidden = page !== "home" || !publicState.videos.length;
  document.querySelectorAll(".ad-slot").forEach(slot => {
    const key = slot.dataset.adSlot;
    const isCatalogAd = key === "betweenVideoCards" && page === "allVideos";
    const isTrendingAd = key === "trendingBanner" && ["home", "trending"].includes(page);
    const isSocialBar = key === "socialAdsBar";
    slot.hidden = page !== "home" && key !== "footerBanner" && key !== "topBanner" && !isCatalogAd && !isTrendingAd && !isSocialBar;
  });
  document.querySelectorAll("#mainNav a").forEach(link => link.classList.toggle("active", link.hash === `#${page}` || (page === "home" && link.hash === "#home")));
}
function videoCard(video) {
  const tags = String(video.tags || "").split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 3).join(" · ");
  return `<article class="video-card" data-open-video="${esc(video.id)}" tabindex="0" role="button" aria-label="Watch ${esc(video.title)}"><div class="card-thumb">${imageMarkup(video.thumbnail, video.title)}<span class="card-category">${esc(video.category || "Uncategorized")}</span><span class="play-overlay" aria-hidden="true">▶</span></div><h3 class="card-title">${esc(video.title || "Untitled video")}</h3><div class="card-info"><span>${Number(video.views || 0).toLocaleString()} views</span><span>${esc(formatDate(video.createdAt))}</span></div>${tags ? `<div class="card-tags">${esc(tags)}</div>` : ""}</article>`;
}
function renderGrid(elementId, videos, emptyText = "No videos available yet.", insertVideoAd = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  if (!videos.length) {
    element.innerHTML = `<div class="empty-state">${esc(emptyText)}</div>`;
    return;
  }
  const cards = videos.map(videoCard);
  if (insertVideoAd && videos.length > 12) cards.splice(12, 0, '<div class="ad-slot video-ad-slot" data-ad-slot="betweenVideoCards"></div>');
  element.innerHTML = cards.join("");
}
function renderAllVideosPagination(pageCount) {
  const element = document.getElementById("allVideosPagination");
  if (!element) return;
  element.hidden = pageCount <= 1;
  element.innerHTML = Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    const active = page === publicState.allVideosPage;
    return `<button class="pagination-button${active ? " active" : ""}" type="button" data-all-videos-page="${page}"${active ? ' aria-current="page"' : ""}>${page}</button>`;
  }).join("");
}
function renderPublic() {
  const videos = publicState.videos.filter(video => video.status === "published");
  const sorted = [...videos].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const hero = document.getElementById("heroSection");
  if (hero && publicState.currentVideoId === null) {
    const savedIds = publicState.settings?.topVideos;
    const topIds = Array.isArray(savedIds) ? savedIds : Object.values(savedIds || {});
    const chosen = topIds.map(id => videos.find(video => video.id === id)).filter(Boolean);
    const topVideos = [...new Map([...chosen, ...sorted].map(video => [video.id, video])).values()].slice(0, 3);
    hero.innerHTML = topVideos.length ? `<div class="top-videos-grid">${topVideos.map((video, index) => `<article class="top-video-card" data-open-video="${esc(video.id)}" tabindex="0" role="button" aria-label="Watch ${esc(video.title)}"><div class="top-video-image">${imageMarkup(video.thumbnail, video.title)}<span class="top-video-rank">0${index + 1}</span><span class="play-overlay" aria-hidden="true">▶</span></div><div class="top-video-copy"><span class="eyebrow">TOP PICK 0${index + 1} · ${esc(video.category || "MOVIE")}</span><h3>${esc(video.title || "Untitled video")}</h3><span class="top-video-views">${Number(video.views || 0).toLocaleString()} views</span></div></article>`).join("")}</div>` : "";
    hero.hidden = !topVideos.length;
  }
  const popular = [...videos].sort((a,b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 8);
  renderGrid("trendingGrid", popular, "No trending videos yet.");
  renderGrid("latestGrid", sorted.slice(0, 8), "No latest videos yet.");
  const filtered = publicState.selectedCategory ? sorted.filter(v => v.category === publicState.selectedCategory) : sorted;
  const pageSize = 15;
  const pageCount = Math.ceil(filtered.length / pageSize);
  publicState.allVideosPage = Math.min(Math.max(publicState.allVideosPage, 1), Math.max(pageCount, 1));
  const pageVideos = filtered.slice((publicState.allVideosPage - 1) * pageSize, publicState.allVideosPage * pageSize);
  renderGrid("allVideosGrid", pageVideos, publicState.selectedCategory ? `No videos in ${publicState.selectedCategory} yet.` : "No videos published yet.", true);
  renderAllVideosPagination(pageCount);
  renderCategories();
  renderSearch();
  renderAdSlots();
  if (!publicState.currentVideoId) showCatalogPage(publicState.currentPage);
}
function renderCategories() {
  const element = document.getElementById("categoryList");
  if (!element) return;
  const categories = publicState.categories.filter(category => category.status === "enabled").sort((a,b) => String(a.name).localeCompare(String(b.name)));
  element.innerHTML = `<button class="category-chip ${!publicState.selectedCategory ? "active" : ""}" data-category="">All videos</button>` + categories.map(category => `<button class="category-chip ${publicState.selectedCategory === category.name ? "active" : ""}" data-category="${esc(category.name)}">${esc(category.name)}</button>`).join("");
}
function renderSearch() {
  const input = document.getElementById("searchInput");
  const query = (input?.value || "").trim().toLowerCase();
  const section = document.getElementById("searchSection");
  if (!section) return;
  if (!query) {
    section.hidden = true;
    if (publicState.currentPage === "search") showCatalogPage("home");
    return;
  }
  showCatalogPage("search");
  document.getElementById("searchHeading").textContent = `Search results for: “${input.value.trim()}”`;
  const matches = publicState.videos.filter(video => video.status === "published" && [video.title, video.tags, video.category].some(value => String(value || "").toLowerCase().includes(query)));
  renderGrid("searchResults", matches, "No videos found.");
}
function adMarkup(content) {
  const value = String(content || "").trim();
  if (!value) return "";
  if (isValidUrl(value)) {
    if (/\.(?:avif|gif|jpe?g|png|webp|svg)(?:[?#]|$)/i.test(value)) {
      return `<a class="ad-image-link" href="${esc(value)}" target="_blank" rel="noopener noreferrer"><img src="${esc(value)}" alt="Advertisement" loading="lazy"></a>`;
    }
    return `<a class="ad-text-link" href="${esc(value)}" target="_blank" rel="noopener noreferrer">Visit advertiser ↗</a>`;
  }
  return value;
}
function renderAdSlots() {
  document.querySelectorAll(".ad-slot[data-ad-slot]").forEach(slot => {
    const key = slot.dataset.adSlot;
    const ads = publicState.settings?.ads || {};
    const configured = ads[key];
    const legacyTrendingAd = ads.betweenFeaturedLatest;
    let setting = configured;
    if (key === "trendingBanner" && configured?.enabled !== true && legacyTrendingAd?.enabled === true) setting = legacyTrendingAd;
    if (key === "footerBanner" && (!configured?.enabled || !String(configured.html || "").trim()) && ads.topBanner?.enabled === true) setting = ads.topBanner;
    const enabled = setting?.enabled === true;
    const html = String(setting?.html || "").trim();
    const markup = enabled ? adMarkup(html) : "";
    slot.classList.toggle("has-ad", !!markup);
    slot.innerHTML = markup;
    slot.querySelectorAll("script").forEach(oldScript => {
      const script = document.createElement("script");
      [...oldScript.attributes].forEach(attribute => script.setAttribute(attribute.name, attribute.value));
      script.textContent = oldScript.textContent;
      oldScript.replaceWith(script);
    });
  });
}
function renderVideoPreroll() {
  const layer = document.getElementById("preRollLayer");
  const player = document.getElementById("videoPlayer");
  if (!layer || !player) return;
  clearInterval(publicState.preRollTimer);
  const setting = publicState.settings?.ads?.preRollVideo;
  const content = String(setting?.html || "").trim();
  if (setting?.enabled !== true || !content) {
    layer.hidden = true;
    player.hidden = false;
    return;
  }
  const media = isValidUrl(content)
    ? `<video class="preroll-video" autoplay muted playsinline controls><source src="${esc(convertDriveVideoUrl(content))}"></video>`
    : `<iframe class="preroll-frame" title="Video advertisement" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(content)}"></iframe>`;
  layer.innerHTML = `${media}<div class="preroll-controls"><span id="preRollCountdown">Ad · Skip available in 5s</span><button id="skipPreRoll" class="button button-primary" type="button" disabled>Skip in 5s</button></div>`;
  layer.hidden = false;
  player.hidden = true;
  let remaining = 5;
  publicState.preRollTimer = setInterval(() => {
    remaining -= 1;
    const countdown = document.getElementById("preRollCountdown");
    const skip = document.getElementById("skipPreRoll");
    if (countdown) countdown.textContent = remaining > 0 ? `Ad · Skip available in ${remaining}s` : "Ad · You can skip now";
    if (remaining <= 0) {
      clearInterval(publicState.preRollTimer);
      if (skip) { skip.disabled = false; skip.textContent = "Skip ad ↗"; }
    } else if (skip) skip.textContent = `Skip in ${remaining}s`;
  }, 1000);
  document.getElementById("skipPreRoll").addEventListener("click", () => {
    clearInterval(publicState.preRollTimer);
    layer.hidden = true;
    player.hidden = false;
  });
}
function openVideo(id) {
  const video = publicState.videos.find(item => item.id === id && item.status === "published");
  if (!video) { showToast("This video is unavailable.", true); return; }
  if (!publicState.currentVideoId) publicState.previousPage = publicState.currentPage;
  publicState.currentVideoId = id;
  if (!publicState.openedViews.has(id) && db) {
    publicState.openedViews.add(id);
    db.ref(`videos/${id}/views`).transaction(current => (Number(current) || 0) + 1).catch(error => console.warn("View count was not updated:", error));
  }
  document.querySelectorAll(".content-section").forEach(section => section.hidden = true);
  document.getElementById("heroSection").hidden = true;
  document.querySelectorAll(".ad-slot").forEach(slot => slot.hidden = true);
  const page = document.getElementById("videoPage");
  page.hidden = false;
  const streamableEmbed = convertStreamableEmbedUrl(video.videoUrl);
  const source = convertDriveVideoUrl(video.videoUrl);
  const driveId = extractDriveFileId(video.videoUrl);
  const drivePreview = driveId ? `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview` : "";
  const playerMarkup = streamableEmbed
    ? `<iframe id="videoPlayer" src="${esc(streamableEmbed)}" title="${esc(video.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" hidden></iframe>`
    : `<video id="videoPlayer" controls playsinline preload="metadata" poster="${esc(convertDriveImageUrl(video.thumbnail))}" hidden><source src="${esc(source)}"></video>`;
  page.innerHTML = `<div class="video-page-top"><button class="text-button" id="backToCatalog">← Back to catalog</button><span class="eyebrow">NOW PLAYING</span></div><div class="player-wrap"><div id="preRollLayer" class="preroll-layer" hidden></div>${playerMarkup}<div id="playerFallback" class="player-fallback" hidden>${drivePreview ? `<iframe title="${esc(video.title)}" src="${esc(drivePreview)}" allow="autoplay; encrypted-media" allowfullscreen></iframe>` : `<strong>This video format or link cannot be played in the browser.</strong><span class="muted">Use a direct, browser-compatible MP4/WebM video URL or a supported Streamable link.</span>`}</div></div><div class="ad-slot video-ad-slot" data-ad-slot="videoPageBanner"></div><div class="video-detail-layout"><article class="video-detail"><div class="detail-category">${esc(video.category || "Uncategorized")} · ${esc(formatDate(video.createdAt))}</div><h1>${esc(video.title)}</h1><div class="card-info video-detail-meta"><span>${(Number(video.views || 0) + (publicState.openedViews.has(id) ? 1 : 0)).toLocaleString()} views</span>${video.tags ? `<span>Tags: ${esc(String(video.tags))}</span>` : ""}</div><p class="video-description">${esc(video.description || "No description provided.")}</p></article><section class="related-section" aria-label="Suggested videos"><div class="section-heading"><div><span class="eyebrow">KEEP WATCHING</span><h2>Suggested videos</h2></div></div><div class="related-list" id="relatedVideos"></div></section></div>`;
  const player = document.getElementById("videoPlayer");
  const fallback = document.getElementById("playerFallback");
  player.addEventListener("error", () => { player.hidden = true; fallback.hidden = false; });
  player.addEventListener("loadedmetadata", () => { fallback.hidden = true; if (document.getElementById("preRollLayer").hidden) player.hidden = false; });
  renderVideoPreroll();
  document.getElementById("relatedVideos").innerHTML = publicState.videos.filter(item => item.status === "published" && item.id !== id).sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 6).map(item => `<article class="related-card" data-open-video="${esc(item.id)}">${imageMarkup(item.thumbnail, item.title)}<div><strong>${esc(item.title)}</strong><small>${esc(item.category || "Video")} · ${Number(item.views || 0).toLocaleString()} views</small></div></article>`).join("") || `<p class="muted">No other published videos to suggest yet.</p>`;
  renderAdSlots();
  document.querySelectorAll(".ad-slot").forEach(slot => { slot.hidden = !["videoPageBanner", "footerBanner", "topBanner", "socialAdsBar"].includes(slot.dataset.adSlot); });
  const topBanner = document.querySelector('.ad-slot[data-ad-slot="topBanner"]');
  (topBanner && !topBanner.hidden ? topBanner : page).scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#watch=${encodeURIComponent(id)}`);
}
function closeVideo(page = publicState.previousPage) {
  publicState.currentVideoId = null;
  document.getElementById("videoPage").hidden = true;
  const targetPage = ["home", "categories", "trending", "latest", "allVideos"].includes(page) ? page : "home";
  history.replaceState(null, "", `${location.pathname}${location.search}#${targetPage}`);
  publicState.currentPage = targetPage;
  renderPublic();
  showCatalogPage(targetPage);
  document.getElementById("home").scrollIntoView({ behavior: "smooth" });
}
function startPublic() {
  const initialPage = location.hash.slice(1);
  showCatalogPage(initialPage.startsWith("watch=") ? "home" : initialPage);
  if (!db) {
    const hero = document.getElementById("heroSection");
    if (hero) hero.innerHTML = `<div class="hero-content"><div class="hero-copy"><span class="eyebrow">SETUP REQUIRED</span><h1>Connect your Firebase project.</h1><p>Add the Firebase web configuration in script.js to load and manage the live catalog.</p></div></div>`;
    showFirebaseSetupError(document.getElementById("allVideosGrid"));
    showFirebaseSetupError(document.getElementById("latestGrid"));
    showFirebaseSetupError(document.getElementById("trendingGrid"));
    return;
  }
  db.ref("videos").orderByChild("status").equalTo("published").on("value", snapshot => {
    publicState.videos = toArray(snapshot.val());
    renderPublic();
    const hash = location.hash.match(/^#watch=(.+)$/);
    if (hash && !publicState.currentVideoId) openVideo(decodeURIComponent(hash[1]));
  }, error => showFirebaseSetupError(document.getElementById("allVideosGrid")));
  db.ref("categories").orderByChild("status").equalTo("enabled").on("value", snapshot => { publicState.categories = toArray(snapshot.val()); renderCategories(); }, () => {});
  db.ref("settings").on("value", snapshot => { publicState.settings = snapshot.val() || {}; renderAdSlots(); }, () => {});
}

// Admin dashboard
function startAdmin() {
  const loginView = document.getElementById("loginView");
  if (!loginView) return;
  const accountView = document.getElementById("accountView");
  const loginForm = document.getElementById("loginForm");
  const errorBox = document.getElementById("loginError");
  const displayNameLabel = document.getElementById("displayNameLabel");
  const modeToggle = document.getElementById("authModeToggle");
  const submitButton = document.getElementById("authSubmitButton");
  let creatingAccount = false;
  let adminEntryRequested = false;
  let brandClicks = 0;
  let brandClickTimer;
  const setAuthMode = signup => {
    creatingAccount = signup;
    document.getElementById("authHeading").textContent = signup ? "Create your account" : "Welcome back";
    document.getElementById("authDescription").textContent = signup ? "Sign up to create your RIZVI.NET account." : "Sign in to see your account details.";
    displayNameLabel.hidden = !signup;
    document.getElementById("displayNameInput").required = signup;
    document.getElementById("loginPassword").autocomplete = signup ? "new-password" : "current-password";
    submitButton.textContent = signup ? "CREATE ACCOUNT" : "SIGN IN";
    modeToggle.textContent = signup ? "Already have an account? Sign in" : "New here? Create an account";
    errorBox.textContent = "";
  };
  modeToggle.addEventListener("click", () => setAuthMode(!creatingAccount));
  document.getElementById("accountLogoutButton").addEventListener("click", () => auth?.signOut());
  document.getElementById("logoutButton").addEventListener("click", () => auth?.signOut());
  document.getElementById("secretAdminButton").addEventListener("click", () => {
    const user = auth?.currentUser;
    if (user?.email?.toLowerCase() !== ADMIN_EMAIL) {
      document.getElementById("accountMessage").textContent = "Admin access is not available for this account.";
      return;
    }
    adminEntryRequested = true;
    accountView.hidden = true;
    document.getElementById("adminApp").hidden = false;
    document.getElementById("adminEmail").textContent = user.email || "Signed in";
    if (!db) {
      const error = document.getElementById("adminError");
      error.hidden = false;
      error.textContent = "Realtime Database is not configured. Add the Database URL in script.js to manage catalog data.";
      return;
    }
    if (!adminListenersStarted) startAdminData();
  });
  document.getElementById("accountBrand").addEventListener("click", event => {
    event.preventDefault();
    brandClicks += 1;
    clearTimeout(brandClickTimer);
    brandClickTimer = setTimeout(() => { brandClicks = 0; }, 1800);
    if (brandClicks >= 5) {
      brandClicks = 0;
      document.getElementById("secretAdminButton").hidden = false;
      document.getElementById("accountMessage").textContent = "";
    }
  });
  if (!firebaseReady || !auth) {
    errorBox.textContent = "Firebase Authentication is unavailable. Check the Firebase configuration and auth SDK.";
    loginForm.addEventListener("submit", event => { event.preventDefault(); errorBox.textContent = "Firebase Authentication is not configured yet."; });
    return;
  }
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    errorBox.textContent = "";
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    try {
      if (creatingAccount) {
        const name = document.getElementById("displayNameInput").value.trim();
        const credential = await auth.createUserWithEmailAndPassword(email, password);
        if (name) {
          await credential.user.updateProfile({ displayName: name });
          document.getElementById("accountName").textContent = name;
        }
      } else {
        await auth.signInWithEmailAndPassword(email, password);
      }
    } catch (error) { errorBox.textContent = authError(error); }
  });
  auth.onAuthStateChanged(user => {
    loginView.hidden = !!user;
    accountView.hidden = !user || adminEntryRequested;
    document.getElementById("adminApp").hidden = !user || !adminEntryRequested;
    if (!user) {
      adminEntryRequested = false;
      document.getElementById("secretAdminButton").hidden = true;
      setAuthMode(false);
      return;
    }
    document.getElementById("accountName").textContent = user.displayName || "Not provided";
    document.getElementById("accountEmail").textContent = user.email || "Not provided";
    document.getElementById("accountUid").textContent = user.uid;
    document.getElementById("accountCreated").textContent = user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : "Unavailable";
    document.getElementById("accountMessage").textContent = "";
    if (adminEntryRequested && user.email?.toLowerCase() === ADMIN_EMAIL) {
      document.getElementById("adminEmail").textContent = user.email || "Signed in";
      if (db && !adminListenersStarted) startAdminData();
    } else if (adminEntryRequested) {
      adminEntryRequested = false;
      accountView.hidden = false;
      document.getElementById("adminApp").hidden = true;
      document.getElementById("accountMessage").textContent = "Admin access is not available for this account.";
    }
  });
}
function authError(error) {
  const messages = { "auth/invalid-credential":"Email or password is incorrect.", "auth/user-not-found":"No account was found for that email.", "auth/wrong-password":"Email or password is incorrect.", "auth/too-many-requests":"Too many attempts. Try again later." };
  return messages[error.code] || error.message || "Unable to sign in.";
}
let adminVideos = [];
let adminCategories = [];
let adminSettings = {};
let adminListenersStarted = false;
function startAdminData() {
  adminListenersStarted = true;
  db.ref(".info/connected").on("value", snapshot => {
    if (snapshot.val() !== true) return;
    const user = auth?.currentUser;
    if (!user) return;
    db.ref(`connectionSignals/${user.uid}`).set({
      type: "demo-connection",
      status: "connected",
      connectedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => console.info("Demo connection signal sent to Firebase."))
      .catch(error => console.warn("Demo connection signal was not saved:", error));
  });
  db.ref("videos").on("value", snapshot => { adminVideos = toArray(snapshot.val()); renderAdmin(); }, error => showAdminError(error));
  db.ref("categories").on("value", snapshot => { adminCategories = toArray(snapshot.val()); renderAdmin(); }, error => showAdminError(error));
  db.ref("settings").on("value", snapshot => fillSettings(snapshot.val() || {}), error => showAdminError(error));
  wireAdminUI();
}
function showAdminError(error) {
  const box = document.getElementById("adminError");
  box.hidden = false;
  box.textContent = `Firebase access error: ${error.message}. Check the Realtime Database rules and make sure this account's UID is authorized.`;
}
function renderAdmin() {
  const published = adminVideos.filter(video => video.status === "published");
  document.getElementById("statTotal").textContent = adminVideos.length.toLocaleString();
  document.getElementById("statPublished").textContent = published.length.toLocaleString();
  document.getElementById("statDraft").textContent = adminVideos.filter(video => video.status !== "published").length.toLocaleString();
  document.getElementById("statViews").textContent = adminVideos.reduce((total, video) => total + (Number(video.views) || 0), 0).toLocaleString();
  document.getElementById("statCategories").textContent = adminCategories.length.toLocaleString();
  const body = document.getElementById("manageVideosBody");
  const ordered = [...adminVideos].sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  body.innerHTML = ordered.length ? ordered.map(video => `<tr><td>${imageMarkup(video.thumbnail, video.title, "table-thumb")}</td><td><span class="table-title">${esc(video.title || "Untitled")}</span></td><td>${esc(video.category || "—")}</td><td>${Number(video.views || 0).toLocaleString()}</td><td><span class="status-pill ${video.status === "published" ? "" : "draft"}">${video.status === "published" ? "Published" : "Draft"}</span></td><td><div class="table-actions"><button class="small-action" data-edit-video="${esc(video.id)}">Edit</button><button class="small-action" data-toggle-publish="${esc(video.id)}">${video.status === "published" ? "Unpublish" : "Publish"}</button><button class="small-action" data-toggle-feature="${esc(video.id)}">${video.featured ? "Unfeature" : "Feature"}</button><button class="small-action delete" data-delete-video="${esc(video.id)}">Delete</button></div></td></tr>`).join("") : `<tr><td colspan="6" class="table-empty">No videos in your library. Add your first video.</td></tr>`;
  renderAdminCategories();
  refreshCategorySelect();
  refreshTopVideoSelects(adminSettings.topVideos);
}
function renderAdminCategories() {
  const element = document.getElementById("adminCategoryList");
  if (!element) return;
  element.innerHTML = adminCategories.length ? adminCategories.map(category => `<div class="admin-category-row"><div><strong>${esc(category.name)}</strong> <span class="status-pill ${category.status === "enabled" ? "" : "disabled"}">${category.status === "enabled" ? "Enabled" : "Disabled"}</span></div><div class="category-row-actions"><button class="small-action" data-edit-category="${esc(category.id)}">Edit</button><button class="small-action" data-toggle-category="${esc(category.id)}">${category.status === "enabled" ? "Disable" : "Enable"}</button><button class="small-action delete" data-delete-category="${esc(category.id)}">Delete</button></div></div>`).join("") : `<p class="muted">No categories yet. Add one above.</p>`;
}
function refreshCategorySelect(selected) {
  const select = document.getElementById("videoCategory");
  if (!select) return;
  const previous = selected || select.value;
  select.innerHTML = `<option value="">Choose a category</option>` + adminCategories.filter(category => category.status === "enabled").map(category => `<option value="${esc(category.name)}">${esc(category.name)}</option>`).join("");
  if (adminCategories.some(category => category.name === previous)) select.value = previous;
}
function refreshTopVideoSelects(selected = null) {
  const selects = ["topVideo1", "topVideo2", "topVideo3"].map(id => document.getElementById(id)).filter(Boolean);
  if (!selects.length) return;
  const saved = selected === null ? selects.map(select => select.value) : (Array.isArray(selected) ? selected : Object.values(selected || {}));
  const published = [...adminVideos].filter(video => video.status === "published").sort((a, b) => String(a.title).localeCompare(String(b.title)));
  selects.forEach((select, index) => {
    const value = saved[index] || "";
    select.innerHTML = `<option value="">Choose a published video</option>` + published.map(video => `<option value="${esc(video.id)}">${esc(video.title || "Untitled video")}</option>`).join("");
    if (published.some(video => video.id === value)) select.value = value;
  });
}
function wireAdminUI() {
  if (wireAdminUI.done) return;
  wireAdminUI.done = true;
  const panelTitles = { dashboardPanel:"Dashboard", videoFormPanel:"Add Video", managePanel:"Manage Videos", topVideosPanel:"Top 3 Videos", categoriesPanel:"Categories", settingsPanel:"Settings" };
  function showPanel(id) {
    document.querySelectorAll(".admin-panel").forEach(panel => panel.hidden = panel.id !== id);
    document.querySelectorAll(".admin-nav-button").forEach(button => button.classList.toggle("active", button.dataset.panel === id));
    document.getElementById("adminPageTitle").textContent = panelTitles[id] || "Dashboard";
  }
  const adminMenuToggle = document.getElementById("adminMenuToggle");
  const adminNav = document.getElementById("adminNav");
  const closeAdminMenu = () => {
    adminNav?.classList.remove("is-open");
    adminMenuToggle?.setAttribute("aria-expanded", "false");
    adminMenuToggle?.setAttribute("aria-label", "Open admin menu");
  };
  adminMenuToggle?.addEventListener("click", () => {
    const isOpen = adminNav.classList.toggle("is-open");
    adminMenuToggle.setAttribute("aria-expanded", String(isOpen));
    adminMenuToggle.setAttribute("aria-label", isOpen ? "Close admin menu" : "Open admin menu");
  });
  document.querySelectorAll(".admin-nav-button").forEach(button => button.addEventListener("click", () => {
    showPanel(button.dataset.panel);
    closeAdminMenu();
  }));
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeAdminMenu(); });
  document.addEventListener("click", event => {
    if (adminNav && !adminNav.contains(event.target) && !adminMenuToggle?.contains(event.target)) closeAdminMenu();
  });
  document.querySelectorAll("[data-go-panel]").forEach(button => button.addEventListener("click", () => showPanel(button.dataset.goPanel)));
  document.getElementById("videoForm").addEventListener("submit", saveVideo);
  document.getElementById("topVideosForm").addEventListener("submit", saveTopVideos);
  document.getElementById("categoryForm").addEventListener("submit", addCategory);
  document.getElementById("settingsForm").addEventListener("submit", saveSettings);
  document.getElementById("cancelEditButton").addEventListener("click", resetVideoForm);
  document.getElementById("manageVideosBody").addEventListener("click", handleVideoAction);
  document.getElementById("adminCategoryList").addEventListener("click", handleCategoryAction);
  document.getElementById("confirmCancel").addEventListener("click", () => document.getElementById("confirmModal").hidden = true);
}
async function saveVideo(event) {
  event.preventDefault();
  const title = document.getElementById("videoTitle").value.trim();
  const thumbnail = document.getElementById("videoThumbnail").value.trim();
  const videoUrl = document.getElementById("videoUrl").value.trim();
  const category = document.getElementById("videoCategory").value;
  if (!title || !thumbnail || !videoUrl || !category) { showToast("Complete all required fields.", true); return; }
  if (extractDriveFileId(thumbnail) === null && !isValidUrl(thumbnail)) { showToast("Enter a valid thumbnail URL or Google Drive link.", true); return; }
  if (extractDriveFileId(videoUrl) === null && !isValidUrl(videoUrl)) { showToast("Enter a valid video URL or Google Drive link.", true); return; }
  const editingId = document.getElementById("editingVideoId").value;
  const existing = adminVideos.find(item => item.id === editingId);
  const data = { title, thumbnail, videoUrl, category, tags: document.getElementById("videoTags").value.trim(), description: document.getElementById("videoDescription").value.trim(), featured: document.getElementById("videoFeatured").value === "true", status: document.getElementById("videoStatus").value, views: Number(existing?.views || 0), createdAt: Number(existing?.createdAt || Date.now()) };
  try {
    if (editingId) await db.ref(`videos/${editingId}`).update(data);
    else await db.ref("videos").push(data);
    showToast(editingId ? "Video updated." : "Video added successfully.");
    resetVideoForm();
    document.querySelector('[data-panel="managePanel"]').click();
  } catch (error) { showToast(`Could not save video: ${error.message}`, true); }
}
function isValidUrl(value) { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch (_) { return false; } }
function resetVideoForm() {
  document.getElementById("videoForm").reset();
  document.getElementById("editingVideoId").value = "";
  document.getElementById("videoFormTitle").textContent = "Add a video";
  document.getElementById("saveVideoButton").textContent = "ADD VIDEO";
  document.getElementById("cancelEditButton").hidden = true;
}
function editVideo(id) {
  const video = adminVideos.find(item => item.id === id);
  if (!video) return;
  document.getElementById("editingVideoId").value = id;
  document.getElementById("videoTitle").value = video.title || "";
  document.getElementById("videoThumbnail").value = video.thumbnail || "";
  document.getElementById("videoUrl").value = video.videoUrl || "";
  document.getElementById("videoTags").value = video.tags || "";
  document.getElementById("videoDescription").value = video.description || "";
  document.getElementById("videoFeatured").value = String(Boolean(video.featured));
  document.getElementById("videoStatus").value = video.status === "published" ? "published" : "draft";
  refreshCategorySelect(video.category);
  if (![...document.getElementById("videoCategory").options].some(option => option.value === video.category)) {
    const option = document.createElement("option"); option.value = video.category; option.textContent = video.category; document.getElementById("videoCategory").append(option);
  }
  document.getElementById("videoCategory").value = video.category || "";
  document.getElementById("videoFormTitle").textContent = "Edit video";
  document.getElementById("saveVideoButton").textContent = "SAVE CHANGES";
  document.getElementById("cancelEditButton").hidden = false;
  document.querySelector('[data-panel="videoFormPanel"]').click();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function confirmAction(message, action) {
  const modal = document.getElementById("confirmModal");
  document.getElementById("confirmMessage").textContent = message;
  modal.hidden = false;
  const accept = document.getElementById("confirmAccept");
  const handler = async () => {
    accept.removeEventListener("click", handler);
    modal.hidden = true;
    try { await action(); } catch (error) { showToast(`Action failed: ${error.message}`, true); }
  };
  accept.addEventListener("click", handler);
}
async function handleVideoAction(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.editVideo || button.dataset.togglePublish || button.dataset.toggleFeature || button.dataset.deleteVideo;
  if (!id) return;
  const video = adminVideos.find(item => item.id === id);
  if (!video) return;
  if (button.dataset.editVideo) { editVideo(id); return; }
  if (button.dataset.togglePublish) {
    try { await db.ref(`videos/${id}/status`).set(video.status === "published" ? "draft" : "published"); showToast(video.status === "published" ? "Video unpublished." : "Video published."); }
    catch (error) { showToast(`Could not update video: ${error.message}`, true); }
  } else if (button.dataset.toggleFeature) {
    try { await db.ref(`videos/${id}/featured`).set(!video.featured); showToast(video.featured ? "Video is no longer featured." : "Video featured."); }
    catch (error) { showToast(`Could not update video: ${error.message}`, true); }
  } else if (button.dataset.deleteVideo) {
    confirmAction(`Delete “${video.title}”? This cannot be undone.`, async () => { await db.ref(`videos/${id}`).remove(); showToast("Video deleted."); });
  }
}
async function addCategory(event) {
  event.preventDefault();
  const field = document.getElementById("categoryName");
  const name = field.value.trim();
  if (!name) return;
  if (adminCategories.some(category => category.name.toLowerCase() === name.toLowerCase())) { showToast("That category already exists.", true); return; }
  try { await db.ref("categories").push({ name, status: "enabled" }); field.value = ""; showToast("Category added."); }
  catch (error) { showToast(`Could not add category: ${error.message}`, true); }
}
async function handleCategoryAction(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.editCategory || button.dataset.toggleCategory || button.dataset.deleteCategory;
  const category = adminCategories.find(item => item.id === id);
  if (!category) return;
  if (button.dataset.editCategory) {
    const name = window.prompt("Edit category name:", category.name);
    if (name === null) return;
    const cleanName = name.trim();
    if (!cleanName) { showToast("Category name cannot be empty.", true); return; }
    if (adminCategories.some(item => item.id !== id && item.name.toLowerCase() === cleanName.toLowerCase())) { showToast("That category already exists.", true); return; }
    try { await db.ref(`categories/${id}/name`).set(cleanName); showToast("Category updated."); } catch (error) { showToast(`Could not update category: ${error.message}`, true); }
  } else if (button.dataset.toggleCategory) {
    try { await db.ref(`categories/${id}/status`).set(category.status === "enabled" ? "disabled" : "enabled"); showToast("Category status updated."); } catch (error) { showToast(`Could not update category: ${error.message}`, true); }
  } else if (button.dataset.deleteCategory) {
    confirmAction(`Delete category “${category.name}”? Videos already assigned to it will retain their category text.`, async () => { await db.ref(`categories/${id}`).remove(); showToast("Category deleted."); });
  }
}
function fillSettings(settings) {
  adminSettings = settings || {};
  const ads = adminSettings.ads || {};
  document.querySelectorAll("[data-ad-enabled]").forEach(input => {
    const key = input.dataset.adEnabled;
    const item = ads[key] || (key === "trendingBanner" ? ads.betweenFeaturedLatest : null) || {};
    input.checked = item.enabled === true;
  });
  document.querySelectorAll("[data-ad-html]").forEach(input => {
    const key = input.dataset.adHtml;
    const item = ads[key] || (key === "trendingBanner" ? ads.betweenFeaturedLatest : null) || {};
    input.value = item.html || "";
  });
  refreshTopVideoSelects(adminSettings.topVideos);
}
async function saveTopVideos(event) {
  event.preventDefault();
  const videoIds = ["topVideo1", "topVideo2", "topVideo3"].map(id => document.getElementById(id).value).filter(Boolean);
  if (new Set(videoIds).size !== videoIds.length) { showToast("Choose a different video for each top spot.", true); return; }
  try {
    await db.ref("settings/topVideos").set(videoIds);
    adminSettings.topVideos = videoIds;
    showToast("Top 3 videos saved for the home page.");
  } catch (error) { showToast(`Could not save top videos: ${error.message}`, true); }
}
async function saveSettings(event) {
  event.preventDefault();
  const ads = {};
  document.querySelectorAll("[data-ad-enabled]").forEach(input => { const key = input.dataset.adEnabled; ads[key] = { enabled: input.checked, html: document.querySelector(`[data-ad-html="${key}"]`).value }; });
  try { await db.ref("settings/ads").set(ads); showToast("Advertisement settings saved."); }
  catch (error) { showToast(`Could not save settings: ${error.message}`, true); }
}

// Event delegation handles catalog cards, including cards refreshed by live Firebase updates.
window.addEventListener("hashchange", () => {
  if (!document.getElementById("heroSection")) return;
  const route = location.hash.slice(1);
  const watchMatch = route.match(/^watch=(.+)$/);
  if (watchMatch) {
    const id = decodeURIComponent(watchMatch[1]);
    if (publicState.currentVideoId !== id) openVideo(id);
    return;
  }
  if (publicState.currentVideoId) closeVideo(route);
  else {
    showCatalogPage(route);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});
document.addEventListener("click", event => {
  const pageButton = event.target.closest("[data-all-videos-page]");
  if (pageButton) {
    publicState.allVideosPage = Number(pageButton.dataset.allVideosPage) || 1;
    renderPublic();
    document.getElementById("allVideos").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const categoryButton = event.target.closest("[data-category]");
  if (categoryButton) {
    publicState.selectedCategory = categoryButton.dataset.category;
    publicState.allVideosPage = 1;
    showCatalogPage("allVideos");
    history.replaceState(null, "", `${location.pathname}${location.search}#allVideos`);
    renderPublic();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const videoTarget = event.target.closest("[data-open-video]");
  if (videoTarget && document.getElementById("videoPage")) { openVideo(videoTarget.dataset.openVideo); return; }
  if (event.target.closest("#backToCatalog")) closeVideo();
});
document.addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && event.target.matches(".video-card, .top-video-card")) { event.preventDefault(); openVideo(event.target.dataset.openVideo); } });
if (document.getElementById("searchForm")) {
  document.getElementById("searchForm").addEventListener("submit", event => { event.preventDefault(); renderSearch(); if (!document.getElementById("searchSection").hidden) document.getElementById("searchSection").scrollIntoView({ behavior:"smooth" }); });
  document.getElementById("searchInput").addEventListener("input", () => { document.getElementById("clearSearch").hidden = !document.getElementById("searchInput").value; renderSearch(); });
  document.getElementById("clearSearch").addEventListener("click", () => { document.getElementById("searchInput").value = ""; document.getElementById("clearSearch").hidden = true; renderSearch(); });
  document.getElementById("mobileSearchToggle").addEventListener("click", () => { const form = document.getElementById("searchForm"); form.classList.toggle("mobile-open"); if (form.classList.contains("mobile-open")) document.getElementById("searchInput").focus(); });
  const menuToggle = document.getElementById("mobileMenuToggle");
  const mainNav = document.getElementById("mainNav");
  if (menuToggle && mainNav) {
    const closeMenu = () => {
      mainNav.classList.remove("mobile-open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open navigation menu");
      menuToggle.textContent = "☰";
    };
    menuToggle.addEventListener("click", () => {
      const isOpen = mainNav.classList.toggle("mobile-open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
      menuToggle.textContent = isOpen ? "×" : "☰";
    });
    mainNav.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeMenu(); });
    document.addEventListener("click", event => {
      if (!mainNav.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
    });
  }
}
function initWelcomeBanner() {
  const banner = document.getElementById("welcomeBanner");
  if (!banner) return;
  let dismissed = false;
  const close = () => {
    if (dismissed) return;
    dismissed = true;
    banner.classList.add("is-closing");
    setTimeout(() => { banner.hidden = true; }, 350);
  };
  document.getElementById("closeWelcomeBanner")?.addEventListener("click", close);
  setTimeout(close, 2000);
}

if (document.getElementById("heroSection")) {
  initWelcomeBanner();
  startPublic();
}
if (document.getElementById("loginView")) startAdmin();
