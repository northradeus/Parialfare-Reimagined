import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const langToggleScript = `
function cleanSlug(str) {
  let s = str || "";
  while (s.startsWith("/")) s = s.slice(1);
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

function getLangState() {
  const currentSlug = cleanSlug(document.body?.dataset?.slug || "");
  const isKm = window.location.pathname.includes("/km/") || 
               window.location.pathname.endsWith("/km") ||
               currentSlug === "km" || 
               currentSlug.startsWith("km/");
  return { currentSlug, isKm };
}

function getBasePath() {
  const raw = cleanSlug(document.body?.dataset?.basepath || "");
  return raw ? "/" + raw : "";
}

function mountLangToggle() {
  const { currentSlug, isKm } = getLangState();
  const basePath = getBasePath();

  // Update page title and home link based on language
  const pageTitleLink = document.querySelector(".page-title a");
  if (pageTitleLink) {
    if (isKm) {
      pageTitleLink.textContent = "ណូលហែម";
      pageTitleLink.setAttribute("href", (basePath ? basePath : "") + "/km/");
    } else {
      pageTitleLink.textContent = "Nolheim";
      pageTitleLink.setAttribute("href", (basePath ? basePath : "") + "/");
    }
  }

  // Also update explorer desktop title
  const explorerTitle = document.querySelector(".explorer button.desktop-explorer h2");
  if (explorerTitle) {
    explorerTitle.textContent = isKm ? "មាតិកា" : "Explorer";
  }

  // Also update footer author link
  const footerLinks = document.querySelectorAll("footer a");
  footerLinks.forEach(function(link) {
    if (link.href && link.href.includes("northrad.carrd.co")) {
      link.textContent = isKm ? "អ្នកនិពន្ធ: ឆុំ ពេជ្រត្យា ឆាណាន់" : "Author: Chhum Pichthyachhanan";
    }
  });
  
  // Find darkmode or readermode in the flex row
  const darkmode = document.querySelector(".darkmode");
  const readermode = document.querySelector(".readermode");
  const anchor = readermode?.parentElement || darkmode?.parentElement;
  
  if (!anchor) {
    return;
  }
  
  let container = document.querySelector(".lang-toggle-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "lang-toggle-container";
    container.style.cssText = "flex-grow: 0; flex-shrink: 0; flex-basis: auto; order: 0; align-self: center; justify-self: center;";
    container.innerHTML = '<button type="button" id="lang-toggle-btn" class="lang-toggle-btn" aria-label="Switch Language"><span class="lang-icon">🌐</span><span class="lang-label">' + (isKm ? "English" : "ខ្មែរ") + '</span></button>';
    anchor.after(container);
  } else if (container.parentElement !== anchor.parentElement) {
    anchor.after(container);
  }

  const btn = document.getElementById("lang-toggle-btn");
  if (btn) {
    const label = btn.querySelector(".lang-label");
    if (label) {
      label.textContent = isKm ? "English" : "ខ្មែរ";
    }
    btn.setAttribute("title", isKm ? "Switch to English" : "ប្តូរទៅភាសាខ្មែរ (Switch to Khmer)");
    
    if (!btn.dataset.initialized) {
      btn.dataset.initialized = "true";
      btn.addEventListener("click", handleLangSwitch);
    }
  }
}

async function handleLangSwitch(e) {
  e.preventDefault();
  const { currentSlug, isKm } = getLangState();
  const basePath = getBasePath();
  let targetSlug = "";

  if (isKm) {
    if (currentSlug === "km" || currentSlug === "km/index" || currentSlug === "index" || currentSlug === "") {
      targetSlug = "";
    } else if (currentSlug.startsWith("km/")) {
      targetSlug = currentSlug.slice(3);
    } else {
      targetSlug = currentSlug;
    }
  } else {
    if (currentSlug === "" || currentSlug === "index") {
      targetSlug = "km";
    } else {
      targetSlug = "km/" + currentSlug;
    }
  }

  try {
    const data = await fetchData;
    const index = (data && data.content) ? data.content : (data || {});

    if (targetSlug === "") {
      window.location.href = (basePath ? basePath : "") + "/";
      return;
    }

    if (targetSlug === "km" || targetSlug === "km/index") {
      window.location.href = (basePath ? basePath : "") + "/km/";
      return;
    }

    if (index[targetSlug]) {
      window.location.href = (basePath ? basePath : "") + "/" + targetSlug;
    } else {
      // Fall back to the language portal
      window.location.href = (basePath ? basePath : "") + (isKm ? "/" : "/km/");
    }
  } catch (err) {
    window.location.href = (basePath ? basePath : "") + (isKm ? "/" : "/km/");
  }
}

function initLangToggle() {
  mountLangToggle();
}

document.addEventListener("nav", initLangToggle);
document.addEventListener("render", initLangToggle);
document.addEventListener("DOMContentLoaded", initLangToggle);
if (document.readyState === "complete" || document.readyState === "interactive") {
  initLangToggle();
}
`;

const LanguageToggle: QuartzComponent = (props?: QuartzComponentProps) => {
  const displayClass = props?.displayClass
  return (
    <div
      class={classNames(displayClass, "lang-toggle-container")}
      style={{
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: "auto",
        order: 0,
        alignSelf: "center",
        justifySelf: "center",
      }}
    >
      <button
        type="button"
        id="lang-toggle-btn"
        class="lang-toggle-btn"
        aria-label="Switch Language"
        title="Switch Language"
      >
        <span class="lang-icon">🌐</span>
        <span class="lang-label">ខ្មែរ</span>
      </button>
    </div>
  )
}

LanguageToggle.afterDOMLoaded = langToggleScript

export default (() => LanguageToggle) satisfies QuartzComponentConstructor
