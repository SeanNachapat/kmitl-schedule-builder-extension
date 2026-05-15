/**
 * KMITL Schedule Builder — Dark Mode
 *
 * Manages theme toggling (light/dark) and persists the preference
 * in chrome.storage.local.  Applies a `ksb-theme-dark` class to
 * all extension root containers so CSS custom properties kick in.
 */

let ksbCurrentTheme = "light";

async function ksbInitDarkMode() {
    const stored = await ksbStorageGet(KSB_THEME_KEY);
    ksbCurrentTheme = stored === "dark" ? "dark" : "light";
    ksbApplyTheme(ksbCurrentTheme);
}

function ksbApplyTheme(theme) {
    ksbCurrentTheme = theme;

    const targets = [
        document.querySelector("#kmitl-schedule-builder-modal-overlay"),
        document.querySelector("#kmitl-schedule-builder-launcher"),
    ];

    targets.forEach((el) => {
        if (!el) return;
        el.classList.toggle("ksb-theme-dark", theme === "dark");
        el.classList.toggle("ksb-theme-light", theme === "light");
    });
}

async function ksbToggleDarkMode() {
    const next = ksbCurrentTheme === "dark" ? "light" : "dark";
    ksbCurrentTheme = next;
    await ksbStorageSet(KSB_THEME_KEY, next);
    ksbApplyTheme(next);
}

function ksbGetCurrentTheme() {
    return ksbCurrentTheme;
}

function ksbRenderDarkModeToggle() {
    const isDark = ksbCurrentTheme === "dark";
    const icon = isDark ? ksbRenderIcon("sun") : ksbRenderIcon("moon");
    const label = isDark ? "Light" : "Dark";
    return `<button
        class="ksb-section-toggle"
        type="button"
        data-ksb-toggle-theme
        aria-label="Toggle dark mode"
    >${icon} ${label}</button>`;
}
