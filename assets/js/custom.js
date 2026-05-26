(function () {
  const STORAGE_KEY = "preferred-lang";
  const DEFAULT_LANG = /^ja\b/i.test(navigator.language) ? "ja" : "en";

  let currentLang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  let translations = {};

  async function loadTranslations(lang) {
    const res = await fetch(`/i18n/${lang}.json`);
    if (!res.ok) throw new Error(`Failed to load /i18n/${lang}.json`);
    return res.json();
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (translations[key] !== undefined) {
        el.textContent = translations[key];
      }
    });
  }

  async function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    translations = await loadTranslations(lang);
    applyTranslations();
    updateToggleLabel();
  }

  function updateToggleLabel() {
    const btn = document.getElementById("lang-toggle");
    if (btn) {
      btn.textContent = currentLang === "en" ? "EN" : "日本語";
    }
  }

  function createToggleButton() {
    const btn = document.createElement("button");
    btn.id = "lang-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "language-switcher");
    btn.className =
      "lang-toggle rounded-lg text-sm font-medium text-slate-700 hover:text-indigo-500 dark:text-slate-400";
    btn.textContent = currentLang === "en" ? "EN" : "日本語";

    btn.addEventListener("click", () => {
      const next = currentLang === "en" ? "ja" : "en";
      setLanguage(next);
    });

    return btn;
  }

  function injectToggle() {
    const themeToggle = document.getElementById("theme-toggle");
    if (!themeToggle) return;

    const btn = createToggleButton();
    themeToggle.parentNode.insertBefore(btn, themeToggle);
  }

  async function init() {
    injectToggle();
    translations = await loadTranslations(currentLang);
    applyTranslations();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
