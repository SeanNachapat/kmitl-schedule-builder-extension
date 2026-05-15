/**
 * KMITL Schedule Builder — Offline Access
 *
 * Caches schedule data for offline viewing when KMITL servers are down.
 */

let ksbOfflineMode = false;
let ksbOfflineCache = null;

async function ksbInitOffline() {
    const cached = await ksbStorageGet(KSB_OFFLINE_CACHE_KEY);
    if (cached && typeof cached === "object") {
        ksbOfflineCache = cached;
    }
}

async function ksbSaveOfflineCache(subjects) {
    const cache = {
        subjects: subjects,
        timestamp: new Date().toISOString(),
        version: "0.3.0",
    };
    ksbOfflineCache = cache;
    await ksbStorageSet(KSB_OFFLINE_CACHE_KEY, cache);
}

function ksbGetOfflineCache() {
    return ksbOfflineCache;
}

function ksbIsOfflineMode() {
    return ksbOfflineMode;
}

function ksbSetOfflineMode(val) {
    ksbOfflineMode = val;
}

function ksbRenderOfflineBanner() {
    if (!ksbOfflineMode || !ksbOfflineCache) return "";
    const ts = ksbOfflineCache.timestamp
        ? new Date(ksbOfflineCache.timestamp).toLocaleString()
        : "Unknown";
    return `<div class="ksb-offline-banner">
        ${ksbRenderIcon("wifi_off")}
        <span>Offline mode — showing cached schedule</span>
        <span class="ksb-offline-timestamp">Last synced: ${ksbEscapeHtml(ts)}</span>
    </div>`;
}

/**
 * Check if the teaching table loaded successfully. If not and we have
 * cached data, switch to offline mode after a timeout.
 */
function ksbCheckOfflineFallback(callback) {
    setTimeout(() => {
        const rows = document.querySelectorAll("tbody tr");
        const hasContent = [...rows].some((r) => {
            const cells = [...r.children].filter((c) => c instanceof HTMLTableCellElement);
            return cells.length > 10;
        });

        if (!hasContent && ksbOfflineCache && ksbOfflineCache.subjects && ksbOfflineCache.subjects.length > 0) {
            ksbOfflineMode = true;
            if (callback) callback();
        }
    }, 5000);
}
