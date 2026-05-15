/**
 * KMITL Schedule Builder — Course Category Color-Coding
 *
 * Detects course categories from 8-digit subject codes using prefix
 * heuristics and assigns colors.  Users can override categories
 * via chrome.storage.local.
 */

const KSB_CATEGORY_PALETTE = {
    "gen-ed":        { label: "Gen-Ed",         color: "#0d9488", bg: "#ccfbf1", border: "#0d9488", darkBg: "#042f2e", darkBorder: "#14b8a6" },
    "major-core":    { label: "Major Core",     color: "#c9471c", bg: "#fff3ed", border: "#f15a24", darkBg: "#431407", darkBorder: "#fb923c" },
    "major-elec":    { label: "Major Elective", color: "#7c3aed", bg: "#ede9fe", border: "#7c3aed", darkBg: "#2e1065", darkBorder: "#a78bfa" },
    "free-elec":     { label: "Free Elective",  color: "#059669", bg: "#d1fae5", border: "#059669", darkBg: "#022c22", darkBorder: "#34d399" },
    "minor":         { label: "Minor",          color: "#0284c7", bg: "#e0f2fe", border: "#0284c7", darkBg: "#082f49", darkBorder: "#38bdf8" },
    "unknown":       { label: "Other",          color: "#6b7280", bg: "#f3f4f6", border: "#9ca3af", darkBg: "#1f2937", darkBorder: "#6b7280" },
};

let ksbCategoryOverrides = {};

async function ksbInitColorCoding() {
    const stored = await ksbStorageGet(KSB_CATEGORY_OVERRIDES_KEY);
    ksbCategoryOverrides = stored && typeof stored === "object" ? stored : {};
}

function ksbDetectCategory(subjectCode) {
    const code = ksbNormalizeWhitespace(subjectCode);
    if (!code || code.length < 8) return "unknown";

    // Check user overrides first
    if (ksbCategoryOverrides[code]) return ksbCategoryOverrides[code];

    const prefix2 = code.substring(0, 2);
    const prefix4 = code.substring(0, 4);

    // Gen-Ed subjects typically start with 90
    if (prefix2 === "90") return "gen-ed";

    // Faculty of Engineering = 01, Science = 02, etc.
    // Major core subjects often start with faculty-specific codes
    // with specific course-level digits
    const courseLevel = parseInt(code.charAt(4), 10);

    // This is a rough heuristic — KMITL uses different patterns per faculty
    // but we can identify common patterns:
    // - x000-level (intro/core) → major-core
    // - x500+ level (advanced/elective) → major-elec
    if (prefix2 === "01" || prefix2 === "02" || prefix2 === "03" ||
        prefix2 === "04" || prefix2 === "05" || prefix2 === "06" ||
        prefix2 === "07" || prefix2 === "08" || prefix2 === "09") {
        if (courseLevel <= 3) return "major-core";
        if (courseLevel >= 5) return "major-elec";
        return "major-core";
    }

    return "unknown";
}

function ksbGetCategoryStyle(subjectCode) {
    const category = ksbDetectCategory(subjectCode);
    return KSB_CATEGORY_PALETTE[category] || KSB_CATEGORY_PALETTE["unknown"];
}

function ksbGetCategoryName(subjectCode) {
    const category = ksbDetectCategory(subjectCode);
    return (KSB_CATEGORY_PALETTE[category] || KSB_CATEGORY_PALETTE["unknown"]).label;
}

async function ksbSetCategoryOverride(subjectCode, category) {
    ksbCategoryOverrides[subjectCode] = category;
    await ksbStorageSet(KSB_CATEGORY_OVERRIDES_KEY, ksbCategoryOverrides);
}

function ksbRenderCategoryLegend() {
    const entries = Object.entries(KSB_CATEGORY_PALETTE)
        .filter(([key]) => key !== "unknown")
        .map(([key, val]) => {
            return `<span class="ksb-legend-item">
                <span class="ksb-legend-swatch" style="background:${val.color};"></span>
                ${ksbEscapeHtml(val.label)}
            </span>`;
        }).join("");

    return `<div class="ksb-category-legend">${ksbRenderIcon("palette")} ${entries}</div>`;
}
