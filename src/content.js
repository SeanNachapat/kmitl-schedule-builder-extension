const STORAGE_KEY = "kmitl_schedule_builder_selected_subjects";
const EXTENSION_FLAG = "data-kmitl-schedule-builder-processed";
const EXTENSION_PROCESSED_VALUE = "true";
const CHECKBOX_WRAPPER_SELECTOR = ".ksb-checkbox-wrapper";
const SUBJECT_CARD_CANDIDATE_SELECTOR = "div, li, article, section";
const SUBJECT_ID_PATTERN = /\b\d{8}\b/;
const TIME_RANGE_PATTERN = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;
const SECTION_PATTERN = /section\s*\(([^)]+)\)/i;
const DEBUG_PARSING = false;
const SUBJECT_TABLE_COLUMNS = {
    subjectCode: 0,
    subjectName: 1,
    credits: 2,
    group: 3,
    classTime: 4,
    room: 5,
    building: 6,
    teacher: 7,
    examInfo: 8,
    condition: 9,
    note: 10,
    capacity: 11,
    enrolled: 12,
    queue: 13,
    registered: 14,
};
const THAI_DAY_MAP = {
    "จันทร์": "Mon",
    "อังคาร": "Tue",
    "พุธ": "Wed",
    "พฤหัสบดี": "Thu",
    "ศุกร์": "Fri",
    "เสาร์": "Sat",
    "อาทิตย์": "Sun",
};
const DAY_KEY_MAP = {
    mon: "Mon",
    monday: "Mon",
    tue: "Tue",
    tuesday: "Tue",
    wed: "Wed",
    wednesday: "Wed",
    thu: "Thu",
    thursday: "Thu",
    fri: "Fri",
    friday: "Fri",
    sat: "Sat",
    saturday: "Sat",
    sun: "Sun",
    sunday: "Sun",
};
const TIMETABLE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIMETABLE_DAY_LABELS = {
    Mon: "Mon",
    Tue: "Tue",
    Wed: "Wed",
    Thu: "Thu",
    Fri: "Fri",
    Sat: "Sat",
    Sun: "Sun",
};
const TIMETABLE_START_MINUTE = 8 * 60;
const TIMETABLE_END_MINUTE = 21 * 60;
const TIMETABLE_SLOT_MINUTES = 30;
const TIMETABLE_FIRST_SLOT_COLUMN = 2;
let pageScanScheduled = false;
let checkboxInjectionInProgress = false;
let checkboxInjectionPending = false;
let showRawTextDebug = false;
let copyStatusTimer = null;
let latestSelectedSubjects = [];
let isPanelCollapsed = true;
let showSubjectGroups = false;
let showSelectedList = false;
const DEBUG_UI = false;

function init() {
    observePageChanges();
    injectCheckboxesIntoSubjectCards();
    injectExtensionUi();
}

function observePageChanges() {
    const observer = new MutationObserver(() => {
        schedulePageScan();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function injectExtensionUi() {
    ensureModalShell();
    ensureSidebarLauncher();
    updateScheduleBuilderVisibility();
}

function ensureModalShell() {
    if (document.querySelector("#kmitl-schedule-builder-panel")) {
        return;
    }

    const overlay = document.createElement("div");
    overlay.id = "kmitl-schedule-builder-modal-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const panel = document.createElement("div");
    panel.id = "kmitl-schedule-builder-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "KMITL Schedule Builder");

    panel.innerHTML = `
    <div class="ksb-panel-header">
        <div class="ksb-panel-title">
            <strong>KMITL Schedule Builder</strong>
            <span id="ksb-selected-count-compact" class="ksb-selected-count-compact">Selected: 0</span>
        </div>
		<div class="ksb-panel-actions">
			<button id="ksb-render-button" type="button">Refresh</button>
			<button id="ksb-clear-button" type="button">Clear</button>
            <button
                id="ksb-collapse-button"
                type="button"
                data-ksb-toggle-panel
                aria-label="Hide KMITL Schedule Builder modal"
                aria-expanded="true"
            >
                Close
            </button>
		</div>
    </div>
    <div class="ksb-panel-body">
        <div class="ksb-panel-toolbar">
            <div id="ksb-selected-count">Selected: 0</div>
            <div class="ksb-section-toggles">
                <button
                    class="ksb-section-toggle"
                    type="button"
                    data-ksb-toggle-section="groups"
                    aria-label="Show subject groups"
                    aria-expanded="false"
                >
                    Show Groups
                </button>
                <button
                    class="ksb-section-toggle"
                    type="button"
                    data-ksb-toggle-section="selectedList"
                    aria-label="Show selected classes list"
                    aria-expanded="false"
                >
                    Show List
                </button>
            </div>
            <label class="ksb-debug-toggle">
                <input id="ksb-debug-toggle" type="checkbox">
                Debug raw text
            </label>
        </div>
        <div class="ksb-export-actions">
            <button class="ksb-export-button" type="button" data-ksb-copy="classes" aria-label="Copy selected classes as plain text">Copy Classes</button>
            <button class="ksb-export-button" type="button" data-ksb-copy="timetable" aria-label="Copy timetable summary as plain text">Copy Timetable</button>
            <button class="ksb-export-button" type="button" data-ksb-copy="groups" aria-label="Copy subject groups as plain text">Copy Groups</button>
            <span id="ksb-copy-status" class="ksb-copy-status" aria-live="polite"></span>
        </div>
        <div id="ksb-timetable"></div>
    </div>
	`;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    document
        .querySelector("#ksb-render-button")
        .addEventListener("click", renderTimetable);

    document
        .querySelector("#ksb-clear-button")
        .addEventListener("click", clearSelectedSubjects);

    overlay.addEventListener("click", handleBackdropClick);

    panel.addEventListener("click", async (event) => {
        if (!(event.target instanceof Element)) return;

        const panelToggle = event.target.closest("[data-ksb-toggle-panel]");
        if (panelToggle instanceof HTMLElement) {
            closeScheduleBuilderModal();
            return;
        }

        const sectionToggle = event.target.closest("[data-ksb-toggle-section]");
        if (sectionToggle instanceof HTMLElement) {
            await togglePanelSection(sectionToggle.dataset.ksbToggleSection);
            return;
        }

        const copyButton = event.target.closest("[data-ksb-copy]");
        if (copyButton instanceof HTMLElement) {
            await handleCopyAction(copyButton.dataset.ksbCopy);
            return;
        }

        const removeButton = event.target.closest("[data-ksb-remove-subject-id]");
        if (!(removeButton instanceof HTMLElement)) return;

        await removeSelectedSubject(removeButton.dataset.ksbRemoveSubjectId);
    });

    panel.addEventListener("change", async (event) => {
        if (!(event.target instanceof HTMLInputElement)) return;
        if (event.target.id !== "ksb-debug-toggle") return;

        showRawTextDebug = event.target.checked;
        if (showRawTextDebug) showSelectedList = true;
        await renderTimetable();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isScheduleBuilderExpanded()) {
            closeScheduleBuilderModal();
        }
    });
    window.addEventListener("resize", updateModalSidebarOffset);
    window.addEventListener("resize", updateSidebarLauncherPosition);

    updateScheduleBuilderVisibility();
}

function updateScheduleBuilderVisibility() {
    updateModalSidebarOffset();
    updateSidebarLauncherPosition();
    updatePanelCollapsedState();
    updateSectionToggleButtons();
    renderTimetable();
}

async function injectCheckboxesIntoSubjectCards() {
    if (checkboxInjectionInProgress) {
        checkboxInjectionPending = true;
        return;
    }

    checkboxInjectionInProgress = true;

    try {
        const cards = findSubjectCards();
        const selectedSubjects = await getSelectedSubjects();

        cards.forEach((card) => {
            if (card.hasAttribute(EXTENSION_FLAG)) return;
            if (card.querySelector(CHECKBOX_WRAPPER_SELECTOR)) return;

            const subject = parseSubjectElement(card);
            if (!subject) return;

            card.setAttribute(EXTENSION_FLAG, EXTENSION_PROCESSED_VALUE);

            const checkboxWrapper = document.createElement("label");
            checkboxWrapper.className = "ksb-checkbox-wrapper";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "ksb-subject-checkbox";
            checkbox.dataset.subjectId = subject.id;
            checkbox.checked = isSubjectSelected(subject.id, selectedSubjects);

            checkbox.addEventListener("change", async () => {
                await toggleSelectedSubject(subject, checkbox.checked);
                await renderTimetable();
            });

            checkboxWrapper.appendChild(checkbox);
            checkboxWrapper.appendChild(document.createTextNode(" Add"));

            getCheckboxInjectionTarget(card).prepend(checkboxWrapper);
        });
    } finally {
        checkboxInjectionInProgress = false;

        if (checkboxInjectionPending) {
            checkboxInjectionPending = false;
            schedulePageScan();
        }
    }
}

function schedulePageScan() {
    if (pageScanScheduled) return;

    pageScanScheduled = true;

    window.setTimeout(() => {
        pageScanScheduled = false;
        injectCheckboxesIntoSubjectCards();
        injectExtensionUi();
        updateSidebarLauncherPosition();
    }, 50);
}

function findSubjectCards() {
    /*
     * Detection is intentionally centralized here. After inspecting the real
     * KMITL DOM, update findSubjectRows or SUBJECT_CARD_CANDIDATE_SELECTOR here.
     *
     * The fallback stays text-based:
     * - visible text contains section(...)
     * - visible text contains HH:mm - HH:mm
     */
    const rows = findSubjectRows();
    const candidates = [...document.querySelectorAll(SUBJECT_CARD_CANDIDATE_SELECTOR)]
        .filter((element) => element instanceof HTMLElement)
        .filter(isLikelySubjectCard);

    const fallbackCards = candidates.filter((element) => {
        return !hasSubjectCardChild(element, candidates);
    });

    return [...rows, ...fallbackCards];
}

function findSubjectRows() {
    return [...document.querySelectorAll("tbody tr")]
        .filter((row) => row instanceof HTMLTableRowElement)
        .filter(isLikelySubjectRow);
}

function isLikelySubjectCard(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest("#kmitl-schedule-builder-panel")) return false;

    if (element instanceof HTMLTableRowElement) {
        return isLikelyKmitlTableRow(element);
    }

    return hasFallbackSubjectCardText(element);
}

function isLikelyKmitlTableRow(row) {
    return isLikelySubjectRow(row);
}

function isLikelySubjectRow(row) {
    if (row.classList.contains("table-space-tr")) return false;

    const cells = getDirectTableCells(row);
    if (cells.length <= SUBJECT_TABLE_COLUMNS.registered) return false;

    const subjectCode = getCellText(row, SUBJECT_TABLE_COLUMNS.subjectCode);
    const subjectName = getCellText(row, SUBJECT_TABLE_COLUMNS.subjectName);
    const groupCell = getCellText(row, SUBJECT_TABLE_COLUMNS.group);
    const classTime = getCellText(row, SUBJECT_TABLE_COLUMNS.classTime);
    const schedule = parseClassScheduleText(classTime);

    return (
        SUBJECT_ID_PATTERN.test(subjectCode) &&
        Boolean(subjectName) &&
        Boolean(extractSectionFromGroupCell(groupCell)) &&
        Boolean(schedule.startTime) &&
        Boolean(schedule.endTime)
    );
}

function hasSubjectCardChild(element, candidates) {
    return candidates.some((candidate) => {
        return hasSubjectCardParent(candidate, [element]);
    });
}

function hasSubjectCardParent(element, candidates) {
    return candidates.some((candidate) => {
        return candidate !== element && candidate.contains(element);
    });
}

function hasFallbackSubjectCardText(element) {
    const text = element.innerText || "";
    const hasSection = SECTION_PATTERN.test(text);
    const hasTime = TIME_RANGE_PATTERN.test(text);

    return hasSection && hasTime;
}

function getCheckboxInjectionTarget(element) {
    if (element instanceof HTMLTableRowElement) {
        return getDirectTableCells(element)[0] || element;
    }

    return element;
}

function parseSubjectElement(element) {
    if (element instanceof HTMLTableRowElement && isLikelySubjectRow(element)) {
        return parseSubjectRow(element);
    }

    return parseSubjectCard(element);
}

function parseSubjectRow(row) {
    const rawText = row.innerText || "";
    const groupCell = getCellText(row, SUBJECT_TABLE_COLUMNS.group);
    const schedule = parseClassScheduleText(getCellText(row, SUBJECT_TABLE_COLUMNS.classTime));

    if (!schedule.startTime || !schedule.endTime) return null;

    const subject = createParsedSubject({
        subjectCode: extractSubjectCode(getCellText(row, SUBJECT_TABLE_COLUMNS.subjectCode)),
        subjectName: getCellText(row, SUBJECT_TABLE_COLUMNS.subjectName),
        credits: getCellText(row, SUBJECT_TABLE_COLUMNS.credits),
        section: extractSectionFromGroupCell(groupCell),
        classType: extractClassTypeFromGroupCell(groupCell),
        day: schedule.day,
        dayText: schedule.dayText,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        room: getCellText(row, SUBJECT_TABLE_COLUMNS.room),
        building: getCellText(row, SUBJECT_TABLE_COLUMNS.building),
        teacher: getCellText(row, SUBJECT_TABLE_COLUMNS.teacher),
        examInfo: extractExamInfo(getCellText(row, SUBJECT_TABLE_COLUMNS.examInfo)),
        condition: getCellText(row, SUBJECT_TABLE_COLUMNS.condition),
        note: getCellText(row, SUBJECT_TABLE_COLUMNS.note),
        capacity: getCellText(row, SUBJECT_TABLE_COLUMNS.capacity),
        enrolled: getCellText(row, SUBJECT_TABLE_COLUMNS.enrolled),
        queue: getCellText(row, SUBJECT_TABLE_COLUMNS.queue),
        registered: getCellText(row, SUBJECT_TABLE_COLUMNS.registered),
        rawText,
    });

    debugLogParsedSubject(subject);

    return {
        ...subject,
        id: createStableSubjectId(subject),
    };
}

function parseSubjectCard(card) {
    /*
     * This parser is intentionally text-first until the real KMITL DOM is
     * inspected. If stable per-field selectors exist, replace individual
     * extract* helpers or pass selector-derived text into createParsedSubject.
    */
    const text = card.innerText || "";
    const schedule = parseClassScheduleText(text);

    const subject = createParsedSubject({
        subjectCode: extractSubjectCode(text),
        subjectName: extractSubjectName(text),
        section: extractSection(text),
        classType: extractClassType(text),
        day: schedule.day,
        dayText: schedule.dayText,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        room: extractRoom(text),
        teacher: extractTeacher(text),
        rawText: text,
    });

    if (!subject.section || !subject.startTime || !subject.endTime) return null;

    debugLogParsedSubject(subject);

    return {
        ...subject,
        id: createStableSubjectId(subject),
    };
}

function createParsedSubject(subject) {
    return {
        id: "",
        subjectCode: normalizeWhitespace(subject.subjectCode),
        subjectName: normalizeWhitespace(subject.subjectName),
        credits: normalizeWhitespace(subject.credits),
        section: normalizeWhitespace(subject.section),
        classType: subject.classType || "unknown",
        day: normalizeDayKey(subject.day),
        dayText: normalizeWhitespace(subject.dayText),
        startTime: normalizeWhitespace(subject.startTime),
        endTime: normalizeWhitespace(subject.endTime),
        room: normalizeWhitespace(subject.room),
        building: normalizeWhitespace(subject.building),
        teacher: normalizeWhitespace(subject.teacher),
        examInfo: normalizeWhitespace(subject.examInfo),
        condition: normalizeWhitespace(subject.condition),
        note: normalizeWhitespace(subject.note),
        capacity: normalizeWhitespace(subject.capacity),
        enrolled: normalizeWhitespace(subject.enrolled),
        queue: normalizeWhitespace(subject.queue),
        registered: normalizeWhitespace(subject.registered),
        rawText: subject.rawText || "",
    };
}

function extractSubjectName(text) {
    const lines = text
        .split("\n")
        .map(normalizeWhitespace)
        .filter(Boolean);

    const subjectLine = lines.find((line) => {
        return (
            /^[A-Z0-9\s:-]+$/.test(line) &&
            !line.includes(":") &&
            !line.toLowerCase().includes("section")
        );
    });

    return subjectLine || "Unknown Subject";
}

function extractSubjectCode(text) {
    const subjectIdMatch = text.match(SUBJECT_ID_PATTERN);
    return subjectIdMatch ? subjectIdMatch[0] : "";
}

function extractSection(text) {
    const explicitSectionMatch = text.match(SECTION_PATTERN);
    if (explicitSectionMatch) return explicitSectionMatch[1];

    const lineSection = text
        .split("\n")
        .map(normalizeWhitespace)
        .find((line) => /^\d+[A-Z]?(?:\s*\([^)]+\))?$/i.test(line));

    return lineSection || "";
}

function extractSectionFromGroupCell(value) {
    const sectionMatch = normalizeWhitespace(value).match(/\d+[A-Z]?/i);
    return sectionMatch ? sectionMatch[0] : "";
}

function extractClassTypeFromGroupCell(value) {
    const normalizedText = normalizeWhitespace(value).toLowerCase();

    if (/ทฤษฎี|lecture|theory/.test(normalizedText)) return "theory";
    if (/ปฏิบัติ|lab|practical/.test(normalizedText)) return "practical";
    if (/สัมมนา|seminar/.test(normalizedText)) return "seminar";

    return "unknown";
}

function extractClassType(text) {
    const normalizedText = normalizeWhitespace(text).toLowerCase();

    if (/ทฤษฎี|lecture|theory/.test(normalizedText)) return "theory";
    if (/ปฏิบัติ|lab|practical/.test(normalizedText)) return "practical";
    if (/สัมมนา|seminar/.test(normalizedText)) return "seminar";

    return "unknown";
}

function extractTimeRange(text) {
    const timeMatch = text.match(TIME_RANGE_PATTERN);

    return {
        startTime: timeMatch ? timeMatch[1] : "",
        endTime: timeMatch ? timeMatch[2] : "",
    };
}

function extractDayAndTime(value) {
    return parseClassScheduleText(value);
}

function parseClassScheduleText(value) {
    const text = normalizeWhitespace(value);
    const timeRange = extractTimeRange(text);
    const dayText = extractThaiDayText(text);

    return {
        day: normalizeThaiDayToKey(dayText),
        dayText,
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
    };
}

function extractThaiDayText(value) {
    const text = normalizeWhitespace(value);

    return Object.keys(THAI_DAY_MAP).find((thaiDay) => {
        return text.includes(thaiDay) || text.includes(`วัน${thaiDay}`);
    }) || "";
}

function normalizeThaiDayToKey(dayText) {
    const normalizedDayText = normalizeWhitespace(dayText).replace(/^วัน/, "");
    return THAI_DAY_MAP[normalizedDayText] || "";
}

function normalizeDayKey(value) {
    const normalizedValue = normalizeWhitespace(value);
    if (!normalizedValue) return "";

    const thaiDayKey = normalizeThaiDayToKey(normalizedValue);
    if (thaiDayKey) return thaiDayKey;

    return DAY_KEY_MAP[normalizedValue.toLowerCase()] || "";
}

function extractExamInfo(value) {
    return normalizeWhitespace(value);
}

function extractDay(text) {
    return normalizeDayKey(extractThaiDayText(text) || text);
}

function extractRoom(text) {
    const lines = text
        .split("\n")
        .map(normalizeWhitespace)
        .filter(Boolean);

    return (
        lines.find((line) => {
            return (
                line.includes("ห้อง") ||
                line.includes("อาคาร") ||
                line.includes("พระจอมเกล้า") ||
                line.includes("สำนัก")
            );
        }) || ""
    );
}

function extractTeacher(text) {
    const lines = text
        .split("\n")
        .map(normalizeWhitespace)
        .filter(Boolean);

    const teacherLine = lines.find((line) => {
        return /อาจารย์|ผู้สอน|teacher|instructor/i.test(line);
    });

    if (!teacherLine) return "";

    return teacherLine
        .replace(/^(อาจารย์|ผู้สอน|teacher|instructor)\s*[:：-]?\s*/i, "")
        .trim();
}

function getDirectTableCells(row) {
    return [...row.children].filter((child) => {
        return child instanceof HTMLTableCellElement;
    });
}

function getCellText(row, columnIndex) {
    const cells = getDirectTableCells(row);
    return normalizeWhitespace(cells[columnIndex]?.innerText || "");
}

function normalizeText(value) {
    return normalizeWhitespace(value);
}

function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function createStableSubjectId(subject) {
    /*
     * Stable IDs let storage survive page refreshes and SPA rerenders. Do not
     * use DOM index here; Angular/Vue can reorder or recreate nodes anytime.
     */
    return [
        subject.subjectCode || subject.code,
        subject.section,
        subject.classType || subject.type,
        subject.day,
        subject.startTime || subject.start,
        subject.endTime || subject.end,
        subject.room,
        subject.building,
    ]
        .map(normalizeSubjectIdPart)
        .filter(Boolean)
        .join("|");
}

function normalizeSubjectIdPart(value) {
    return normalizeWhitespace(value || "")
        .toLowerCase()
        .replace(/[|]/g, "/");
}

function debugLogParsedSubject(subject) {
    if (!DEBUG_PARSING) return;
    console.debug("[KSB] Parsed subject", subject);
}

async function toggleSelectedSubject(subject, checked) {
    const selectedSubjects = await getSelectedSubjects();

    const nextSubjects = checked
        ? [
            ...selectedSubjects.filter((item) => item.id !== subject.id),
            subject,
        ]
        : selectedSubjects.filter((item) => item.id !== subject.id);

    try {
        await saveSelectedSubjects(nextSubjects);
    } catch (err) {
        // chrome.storage may throw 'Extension context invalidated' if the
        // extension is being reloaded/unloaded. Fail gracefully and keep
        // selected subjects in memory.
        if (DEBUG_UI) console.warn("[KSB] saveSelectedSubjects failed:", err);
        latestSelectedSubjects = normalizeSelectedSubjects(nextSubjects);
    }
}

async function getSelectedSubjects() {
    // Prefer chrome.storage.local, but gracefully fall back to localStorage
    try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && chrome.storage.local.get) {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            const selectedSubjects = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
            const normalizedSubjects = normalizeSelectedSubjects(selectedSubjects);

            if (normalizedSubjects.length !== selectedSubjects.length) {
                // attempt to persist normalized form; swallow errors
                try {
                    await saveSelectedSubjects(normalizedSubjects);
                } catch (e) {
                    if (DEBUG_UI) console.warn("[KSB] Failed to save normalized subjects:", e);
                }
            }

            return normalizedSubjects;
        }
    } catch (err) {
        if (DEBUG_UI) console.warn("[KSB] chrome.storage.local.get failed:", err);
    }

    // Fallback to window.localStorage
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return normalizeSelectedSubjects(Array.isArray(parsed) ? parsed : []);
    } catch (err) {
        if (DEBUG_UI) console.warn("[KSB] localStorage.getItem failed:", err);
        return [];
    }
}

async function saveSelectedSubjects(subjects) {
    const normalized = normalizeSelectedSubjects(subjects);

    // Try chrome.storage.local first, fallback to localStorage
    try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && chrome.storage.local.set) {
            await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
            return;
        }
    } catch (err) {
        if (DEBUG_UI) console.warn("[KSB] chrome.storage.local.set failed:", err);
    }

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (err) {
        if (DEBUG_UI) console.warn("[KSB] localStorage.setItem failed:", err);
        // As a last resort, keep in-memory (not persisted)
        latestSelectedSubjects = normalized;
    }
}

function normalizeSelectedSubjects(subjects) {
    const subjectsById = new Map();

    subjects.forEach((subject) => {
        if (!subject || !subject.id) return;
        subjectsById.set(subject.id, subject);
    });

    return [...subjectsById.values()];
}

function isSubjectSelected(subjectId, selectedSubjects) {
    return selectedSubjects.some((subject) => subject.id === subjectId);
}

async function clearSelectedSubjects() {
    await saveSelectedSubjects([]);

    syncAllVisibleCheckboxes([]);

    await renderTimetable();
}

async function renderTimetable() {
    await renderSelectedSubjectPanel();
}

function togglePanelCollapsed() {
    setScheduleBuilderExpanded(isPanelCollapsed);
}

function openScheduleBuilderModal() {
    debugUi("openScheduleBuilderModal() called");
    try {
        ensureModalShell();
        isPanelCollapsed = false;
        updateModalSidebarOffset();
        updatePanelCollapsedState();
        updateSectionToggleButtons();
        renderTimetable();
        debugUi("Modal opened successfully", { isOpen: isModalOpen() });
    } catch (error) {
        console.error("[KSB] Failed to open schedule builder modal", error);
    }
}

function closeScheduleBuilderModal() {
    try {
        isPanelCollapsed = true;
        updatePanelCollapsedState();
        updateSectionToggleButtons();
        ensureSidebarLauncher();
        debugUi("Modal closed successfully", { isOpen: isModalOpen() });
    } catch (error) {
        console.error("[KSB] Failed to close schedule builder modal", error);
    }
}

function setScheduleBuilderExpanded(isExpanded) {
    isPanelCollapsed = !isExpanded;
    updateScheduleBuilderVisibility();
}

function isScheduleBuilderExpanded() {
    return !isPanelCollapsed;
}

function handleBackdropClick(event) {
    if (event.target?.id === "kmitl-schedule-builder-modal-overlay") {
        closeScheduleBuilderModal();
    }
}

async function togglePanelSection(sectionName) {
    if (sectionName === "groups") {
        showSubjectGroups = !showSubjectGroups;
    }

    if (sectionName === "selectedList") {
        showSelectedList = !showSelectedList;
    }

    updateSectionToggleButtons();
    await renderTimetable();
}

function updatePanelCollapsedState() {
    const overlay = document.querySelector("#kmitl-schedule-builder-modal-overlay");
    const panel = document.querySelector("#kmitl-schedule-builder-panel");
    const collapseButton = document.querySelector("#ksb-collapse-button");
    if (!overlay || !panel || !collapseButton) return;

    panel.classList.toggle("ksb-panel--collapsed", isPanelCollapsed);
    overlay.classList.toggle("ksb-modal-overlay--open", !isPanelCollapsed);
    overlay.setAttribute("aria-hidden", String(isPanelCollapsed));
    collapseButton.textContent = "Close";
    collapseButton.setAttribute(
        "aria-label",
        "Hide KMITL Schedule Builder modal"
    );
    collapseButton.setAttribute("aria-expanded", String(!isPanelCollapsed));

    if (isPanelCollapsed) {
        ensureSidebarLauncher();
    } else {
        removeSidebarLauncher();
    }
}

function updateSectionToggleButtons() {
    updateSectionToggleButton("groups", "Groups", showSubjectGroups);
    updateSectionToggleButton("selectedList", "List", showSelectedList);
}

function updateSectionToggleButton(sectionName, label, isVisible) {
    const button = document.querySelector(`[data-ksb-toggle-section="${sectionName}"]`);
    if (!button) return;

    button.textContent = `${isVisible ? "Hide" : "Show"} ${label}`;
    button.setAttribute("aria-expanded", String(isVisible));
    button.setAttribute(
        "aria-label",
        `${isVisible ? "Hide" : "Show"} ${label.toLowerCase()} section`
    );
}

function updateSelectedCountDisplay(selectedCount) {
    const countText = `Selected: ${selectedCount}`;
    const countElement = document.querySelector("#ksb-selected-count");
    const compactCountElement = document.querySelector("#ksb-selected-count-compact");

    if (countElement) countElement.textContent = countText;
    if (compactCountElement) compactCountElement.textContent = countText;
    renderSidebarLauncher(selectedCount);
}

function findKmitlSidebar() {
    const sidebarSelectors = [
        "aside",
        "nav",
        "[class*='sidebar' i]",
        "[class*='side-bar' i]",
        "[class*='sidenav' i]",
        "[class*='side-nav' i]",
        "[class*='side-menu' i]",
        "[class*='menu-left' i]",
        "[class*='left-menu' i]",
        "[class*='mat-sidenav' i]",
        "[class*='ant-layout-sider' i]",
    ];

    try {
        return [...document.querySelectorAll(sidebarSelectors.join(","))]
            .filter((element) => element instanceof HTMLElement)
            .filter((element) => !element.closest("#kmitl-schedule-builder-modal-overlay"))
            .filter((element) => !element.closest("#kmitl-schedule-builder-launcher"))
            .map((element) => ({
                element,
                rect: element.getBoundingClientRect(),
            }))
            .filter(({ rect }) => {
                return (
                    rect.width >= 120 &&
                    rect.width <= 460 &&
                    rect.height >= 240 &&
                    rect.left <= 80 &&
                    rect.right < window.innerWidth * 0.55
                );
            })
            .sort((first, second) => {
                return first.rect.left - second.rect.left || second.rect.height - first.rect.height;
            })[0]?.element || null;
    } catch (error) {
        console.warn("[KSB] Failed to find sidebar", error);
        return null;
    }
}

function getSidebarWidth() {
    const sidebar = findKmitlSidebar();
    if (!sidebar) return 320;

    const rect = sidebar.getBoundingClientRect();
    return Math.max(0, Math.min(Math.round(rect.right), window.innerWidth - 48));
}

function updateModalSidebarOffset() {
    const overlay = document.querySelector("#kmitl-schedule-builder-modal-overlay");
    if (!overlay) return;

    const sidebarWidth = getSidebarWidth();
    overlay.style.setProperty("--ksb-sidebar-width", `${sidebarWidth}px`);
}

function getSidebarRect() {
    const sidebar = findKmitlSidebar();
    if (!sidebar) {
        return {
            left: 12,
            width: 260,
            top: 96,
            bottom: 16,
        };
    }

    const rect = sidebar.getBoundingClientRect();
    return {
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        top: Math.round(rect.top),
        bottom: Math.round(window.innerHeight - rect.bottom),
    };
}

function updateSidebarLauncherPosition() {
    const launcher = document.querySelector("#kmitl-schedule-builder-launcher");
    if (!launcher) return;

    const sidebarRect = getSidebarRect();
    const launcherLeft = sidebarRect.left + 12;
    const launcherWidth = Math.max(220, sidebarRect.width - 24);
    const launcherBottom = 16;

    launcher.style.setProperty("--ksb-launcher-left", `${launcherLeft}px`);
    launcher.style.setProperty("--ksb-launcher-width", `${launcherWidth}px`);
    launcher.style.setProperty("--ksb-launcher-bottom", `${launcherBottom}px`);

    if (DEBUG_UI) {
        console.debug(
            "[KSB] Launcher position updated:",
            { launcherLeft, launcherWidth, launcherBottom }
        );
    }
}

function ensureSidebarLauncher() {
    if (!isPanelCollapsed) {
        removeSidebarLauncher();
        return null;
    }

    let launcher = document.querySelector("#kmitl-schedule-builder-launcher");
    if (!launcher) {
        launcher = createSidebarLauncher();
        document.body.appendChild(launcher);
    }

    updateSidebarLauncherPosition();
    renderSidebarLauncher(latestSelectedSubjects.length);
    return launcher;
}

function createSidebarLauncher() {
    const launcher = document.createElement("div");
    launcher.id = "kmitl-schedule-builder-launcher";
    return launcher;
}



function renderSidebarLauncher(selectedCount) {
    if (!isPanelCollapsed) return;

    const launcher = document.querySelector("#kmitl-schedule-builder-launcher");
    if (!launcher) return;

    if (launcher.dataset.ksbSelectedCount === String(selectedCount)) {
        return;
    }
    launcher.dataset.ksbSelectedCount = String(selectedCount);

    const launcherHtml = `
        <div class="ksb-sidebar-launcher-title">Schedule Builder</div>
        <div class="ksb-sidebar-launcher-count">Selected: ${escapeHtml(selectedCount)}</div>
        <button
            class="ksb-sidebar-launcher-button"
            type="button"
            data-ksb-open-modal="true"
            aria-label="Show KMITL Schedule Builder"
        >
            <span class="ksb-sidebar-launcher-button-text">Show</span>
        </button>
    `;

    launcher.innerHTML = launcherHtml;
    bindSidebarLauncherButton(launcher);
}

function bindSidebarLauncherButton(launcher) {
    const button = launcher.querySelector("[data-ksb-open-modal]");
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.dataset.ksbOpenBound === "true") return;

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        debugUi("Show button clicked (direct)");
        try {
            openScheduleBuilderModal();
        } catch (error) {
            console.error("[KSB] Show button click failed", error);
        }
    });

    button.dataset.ksbOpenBound = "true";
}

function debugUi(message, data) {
    if (typeof DEBUG_UI === "undefined" || !DEBUG_UI) return;
    console.debug("[KSB UI]", message, data || "");
}

function isModalOpen() {
    return (
        document
            .querySelector("#kmitl-schedule-builder-modal-overlay")
            ?.classList
            .contains("ksb-modal-overlay--open") || false
    );
}

function removeSidebarLauncher() {
    document.querySelector("#kmitl-schedule-builder-launcher")?.remove();
}

async function renderSelectedSubjectPanel() {
    const selectedSubjects = await getSelectedSubjects();
    latestSelectedSubjects = selectedSubjects;

    const timetableElement = document.querySelector("#ksb-timetable");
    const debugToggle = document.querySelector("#ksb-debug-toggle");

    if (!timetableElement) return;

    syncAllVisibleCheckboxes(selectedSubjects);
    updateSelectedCountDisplay(selectedSubjects.length);
    updatePanelCollapsedState();
    updateSectionToggleButtons();
    if (debugToggle) debugToggle.checked = showRawTextDebug;

    if (selectedSubjects.length === 0) {
        timetableElement.innerHTML = renderSelectedSubjectList(selectedSubjects);
        return;
    }

    const conflicts = getSubjectConflicts(selectedSubjects);
    const conflictingSubjectIds = getConflictingSubjectIds(conflicts);
    const duplicateSelections = getDuplicateSubjectSelections(selectedSubjects);

    timetableElement.innerHTML = `
        ${renderConflictWarnings(conflicts)}
        ${renderDuplicateSelectionWarnings(duplicateSelections)}
        ${showSubjectGroups ? renderSubjectGroupSummary(selectedSubjects) : ""}
        ${renderTimetableGrid(selectedSubjects, conflictingSubjectIds)}
        ${renderUnplaceableSubjects(selectedSubjects)}
        ${showSelectedList ? renderSelectedSubjectList(selectedSubjects, conflictingSubjectIds) : ""}
    `;
}

function renderSelectedSubjectList(subjects, conflictingSubjectIds = new Set()) {
    if (subjects.length === 0) {
        return `
        <div class="ksb-empty-state">
            Select class rows from the table to build your timetable.
        </div>
        `;
    }

    return `
    <div class="ksb-selected-subject-list">
        <div class="ksb-selected-list-title">Selected classes</div>
        ${subjects.map((subject) => renderSelectedSubjectCard(subject, conflictingSubjectIds)).join("")}
    </div>
    `;
}

function renderTimetableGrid(subjects, conflictingSubjectIds = new Set()) {
    const placeableSubjects = getPlaceableSubjects(subjects);

    return `
    <div class="ksb-timetable-section">
        <div class="ksb-timetable-scroll">
            <div class="ksb-timetable-grid">
                ${renderTimetableHeaderSlots()}
                ${renderTimetableDayRows(placeableSubjects, conflictingSubjectIds)}
            </div>
        </div>
    </div>
    `;
}

function renderTimetableHeaderSlots() {
    return `
    <div class="ksb-timetable-header">
        <div class="ksb-timetable-corner">Day</div>
        ${getTimetableSlots()
            .filter((slot) => slot.minutes % 60 === 0)
            .map((slot) => {
                return `<div class="ksb-timetable-hour" style="grid-column: ${slot.columnStart} / span 2;">${escapeHtml(slot.label)}</div>`;
            })
            .join("")}
    </div>
    `;
}

function renderTimetableDayRows(subjects, conflictingSubjectIds = new Set()) {
    return TIMETABLE_DAYS.map((day) => {
        const daySubjects = subjects.filter((subject) => {
            return getSubjectGridPlacement(subject).day === day;
        });

        return `
        <div class="ksb-timetable-row">
            <div class="ksb-timetable-day">${escapeHtml(TIMETABLE_DAY_LABELS[day])}</div>
            ${getTimetableSlots().map(renderTimetableCell).join("")}
            ${daySubjects.map((subject) => renderTimetableSubjectBlock(subject, conflictingSubjectIds)).join("")}
        </div>
        `;
    }).join("");
}

function renderTimetableCell(slot) {
    return `<div class="ksb-timetable-cell" style="grid-column: ${slot.columnStart};"></div>`;
}

function renderTimetableSubjectBlock(subject, conflictingSubjectIds = new Set()) {
    const placement = getSubjectGridPlacement(subject);
    const location = getSubjectDisplayLocation(subject);
    const conflictClass = isSubjectConflicting(subject, conflictingSubjectIds)
        ? " ksb-timetable-block--conflict"
        : "";

    return `
    <div
        class="ksb-timetable-block${conflictClass}"
        style="grid-column: ${placement.columnStart} / span ${placement.columnSpan};"
        title="${escapeHtml(getSubjectDisplayName(subject))}"
    >
        <div class="ksb-timetable-block-name">${escapeHtml(getSubjectDisplayName(subject))}</div>
        <div class="ksb-timetable-block-meta">
            ${escapeHtml(getSubjectDisplayClassType(subject))}
            ${subject.section ? ` | section(${escapeHtml(subject.section)})` : ""}
        </div>
        <div class="ksb-timetable-block-time">
            ${escapeHtml(getSubjectStartTime(subject))} - ${escapeHtml(getSubjectEndTime(subject))}
        </div>
        ${location ? `<div class="ksb-timetable-block-location">${escapeHtml(location)}</div>` : ""}
    </div>
    `;
}

function renderConflictWarnings(conflicts) {
    if (conflicts.length === 0) return "";

    return `
    <div class="ksb-conflict-warning">
        <div class="ksb-conflict-title">Schedule conflicts</div>
        ${conflicts.map(renderConflictItem).join("")}
    </div>
    `;
}

function renderConflictItem(conflict) {
    const subjectDetails = conflict.subjects.map((subject) => {
        return [
            getSubjectDisplayCode(subject),
            getSubjectDisplayName(subject),
            subject.section ? `section(${subject.section})` : "",
            getSubjectDisplayClassType(subject),
        ].filter(Boolean).join(" ");
    });

    return `
    <div class="ksb-conflict-item">
        <strong>${escapeHtml(conflict.day)} ${escapeHtml(conflict.startTime)} - ${escapeHtml(conflict.endTime)}</strong>
        <span>${subjectDetails.map(escapeHtml).join(" vs ")}</span>
    </div>
    `;
}

function getSubjectGroupKey(subject) {
    const subjectCode = normalizeSubjectIdPart(getSubjectDisplayCode(subject));
    if (subjectCode) return subjectCode;

    const rawSubjectName = normalizeWhitespace(subject.subjectName || subject.name || "");
    const subjectName = normalizeSubjectIdPart(rawSubjectName);
    return subjectName || "";
}

function groupSubjectsByCode(subjects) {
    const groups = new Map();

    subjects.forEach((subject) => {
        const groupKey = getSubjectGroupKey(subject);
        if (!groupKey) return;

        if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
        }

        groups.get(groupKey).push(subject);
    });

    return groups;
}

function getSubjectGroupSummary(subjects) {
    return [...groupSubjectsByCode(subjects).entries()]
        .map(([groupKey, groupSubjects]) => ({
            groupKey,
            subjects: groupSubjects,
            classTypes: getSelectedClassTypesForGroup(groupSubjects),
        }))
        .sort((a, b) => {
            const firstLabel = getSubjectDisplayCode(a.subjects[0]) || getSubjectDisplayName(a.subjects[0]);
            const secondLabel = getSubjectDisplayCode(b.subjects[0]) || getSubjectDisplayName(b.subjects[0]);
            return firstLabel.localeCompare(secondLabel);
        });
}

function getSelectedClassTypesForGroup(groupSubjects) {
    return [...new Set(groupSubjects.map(normalizeSubjectClassTypeKey))];
}

function getDuplicateSubjectSelections(subjects) {
    const duplicates = [];

    groupSubjectsByCode(subjects).forEach((groupSubjects) => {
        const subjectsByClassType = new Map();

        groupSubjects.forEach((subject) => {
            const classType = normalizeSubjectClassTypeKey(subject);
            if (!subjectsByClassType.has(classType)) {
                subjectsByClassType.set(classType, []);
            }

            subjectsByClassType.get(classType).push(subject);
        });

        subjectsByClassType.forEach((sameTypeSubjects, classType) => {
            if (sameTypeSubjects.length < 2) return;
            if (!hasDuplicateSelectionDifference(sameTypeSubjects)) return;

            duplicates.push({
                id: [
                    getSubjectGroupKey(sameTypeSubjects[0]),
                    classType,
                    ...sameTypeSubjects.map((subject) => subject.id || ""),
                ].join("|"),
                classType,
                subjects: sameTypeSubjects,
            });
        });
    });

    return duplicates;
}

function hasDuplicateSelectionDifference(subjects) {
    const signatures = new Set(
        subjects.map((subject) => {
            return [
                normalizeSubjectIdPart(subject.section),
                normalizeSubjectIdPart(getSubjectStartTime(subject)),
                normalizeSubjectIdPart(getSubjectEndTime(subject)),
            ].join("|");
        })
    );

    return signatures.size > 1;
}

function normalizeSubjectClassTypeKey(subject) {
    const classType = subject.classType || subject.type || "unknown";
    const labels = {
        theory: "theory",
        practical: "practical",
        seminar: "seminar",
        "ทฤษฎี": "theory",
        "ปฏิบัติ": "practical",
        "สัมมนา": "seminar",
        unknown: "unknown",
    };

    return labels[classType] || "unknown";
}

function renderSubjectGroupSummary(subjects) {
    const groupSummaries = getSubjectGroupSummary(subjects);
    if (groupSummaries.length === 0) return "";

    return `
    <div class="ksb-subject-group-summary">
        <div class="ksb-subject-group-title">Subject groups</div>
        ${groupSummaries.map(renderSubjectGroup).join("")}
    </div>
    `;
}

function renderSubjectGroup(groupSummary) {
    const representativeSubject = groupSummary.subjects[0];
    const subjectCode = getSubjectDisplayCode(representativeSubject);
    const subjectName = getSubjectDisplayName(representativeSubject);
    const groupHints = getSubjectGroupHints(groupSummary);

    return `
    <div class="ksb-subject-group">
        <div class="ksb-subject-group-header">
            <strong>${escapeHtml(subjectCode || subjectName)}</strong>
            ${subjectCode ? `<span>${escapeHtml(subjectName)}</span>` : ""}
            <em>${escapeHtml(String(groupSummary.subjects.length))} selected component${groupSummary.subjects.length === 1 ? "" : "s"}</em>
        </div>
        <div class="ksb-subject-group-components">
            ${groupSummary.subjects.map(renderSubjectGroupComponent).join("")}
        </div>
        ${groupHints.map((hint) => `<div class="ksb-subject-group-hint">${escapeHtml(hint)}</div>`).join("")}
    </div>
    `;
}

function renderSubjectGroupComponent(subject) {
    const details = [
        getSubjectDisplayClassType(subject),
        subject.section ? `section(${subject.section})` : "",
        getSubjectDisplayDay(subject),
        [getSubjectStartTime(subject), getSubjectEndTime(subject)].filter(Boolean).join(" - "),
    ].filter(Boolean);

    return `<div class="ksb-subject-group-component">${details.map(escapeHtml).join(" | ")}</div>`;
}

function getSubjectGroupHints(groupSummary) {
    const selectedClassTypes = new Set(groupSummary.classTypes);
    const hints = [];

    if (selectedClassTypes.has("practical") && !selectedClassTypes.has("theory")) {
        hints.push("Practical selected without theory. Check whether this subject also requires a theory section.");
    }

    if (
        selectedClassTypes.has("theory") &&
        !selectedClassTypes.has("practical") &&
        !selectedClassTypes.has("seminar")
    ) {
        hints.push("Theory selected. If this subject has practical/seminar rows, select those too if required.");
    }

    if (selectedClassTypes.has("practical")) {
        hints.push("Practical section mapping may depend on department rules. Verify before finalizing.");
    }

    return hints;
}

function renderDuplicateSelectionWarnings(duplicates) {
    if (duplicates.length === 0) return "";

    return `
    <div class="ksb-duplicate-warning">
        <div class="ksb-duplicate-title">Duplicate or alternative selections</div>
        ${duplicates.map(renderDuplicateSelectionItem).join("")}
    </div>
    `;
}

function renderDuplicateSelectionItem(duplicate) {
    const representativeSubject = duplicate.subjects[0];
    const duplicateDetails = duplicate.subjects.map((subject) => {
        return [
            subject.section ? `section(${subject.section})` : "",
            getSubjectDisplayDay(subject),
            [getSubjectStartTime(subject), getSubjectEndTime(subject)].filter(Boolean).join(" - "),
        ].filter(Boolean).join(" | ");
    });

    return `
    <div class="ksb-duplicate-item">
        <strong>${escapeHtml(getSubjectDisplayCode(representativeSubject) || getSubjectDisplayName(representativeSubject))}</strong>
        <span>You selected multiple ${escapeHtml(getSubjectDisplayClassType(representativeSubject))} sections for the same subject. This may be intentional, but usually you only need one.</span>
        <em>${duplicateDetails.map(escapeHtml).join(" vs ")}</em>
    </div>
    `;
}

async function handleCopyAction(copyType) {
    const selectedSubjects = latestSelectedSubjects;
    if (selectedSubjects.length === 0) {
        setCopyStatus("Nothing to copy");
        return;
    }

    const copyConfig = {
        classes: {
            text: buildSelectedClassesText(selectedSubjects),
            successMessage: "Copied selected classes",
        },
        timetable: {
            text: buildTimetableSummaryText(selectedSubjects),
            successMessage: "Copied timetable summary",
        },
        groups: {
            text: buildSubjectGroupsText(selectedSubjects),
            successMessage: "Copied subject groups",
        },
    };
    const config = copyConfig[copyType];

    if (!config || !normalizeWhitespace(config.text)) {
        setCopyStatus("Nothing to copy");
        return;
    }

    try {
        await copyTextToClipboard(config.text);
        setCopyStatus(config.successMessage);
    } catch {
        setCopyStatus("Copy failed");
    }
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";

    document.body.appendChild(textarea);
    textarea.select();

    try {
        const copied = document.execCommand("copy");
        if (!copied) throw new Error("Clipboard copy command failed");
    } finally {
        textarea.remove();
    }
}

function setCopyStatus(message) {
    const statusElement = document.querySelector("#ksb-copy-status");
    if (!statusElement) return;

    statusElement.textContent = message;
    clearCopyStatusLater();
}

function clearCopyStatusLater() {
    window.clearTimeout(copyStatusTimer);
    copyStatusTimer = window.setTimeout(() => {
        const statusElement = document.querySelector("#ksb-copy-status");
        if (statusElement) statusElement.textContent = "";
    }, 2500);
}

function buildSelectedClassesText(subjects) {
    return [
        "KMITL Schedule Builder - Selected Classes",
        "",
        ...subjects.flatMap((subject, index) => [
            `${index + 1}. ${formatSelectedClassHeading(subject)}`,
            ...formatSubjectDetailedText(subject).map((line) => `   ${line}`),
            "",
        ]),
    ].join("\n").trim();
}

function buildTimetableSummaryText(subjects) {
    const subjectsByDay = getSubjectsSortedByDayAndTime(subjects);
    const conflicts = getSubjectConflicts(subjects);
    const unplaceableSubjects = getUnplaceableSubjects(subjects);
    const lines = ["KMITL Schedule Builder - Timetable Summary", ""];

    TIMETABLE_DAYS.forEach((day) => {
        const daySubjects = subjectsByDay.get(day) || [];

        lines.push(TIMETABLE_DAY_LABELS[day]);

        if (daySubjects.length === 0) {
            lines.push("- No selected classes");
        } else {
            daySubjects.forEach((subject) => {
                lines.push(`- ${formatSubjectTextLine(subject)}`);
            });
        }

        lines.push("");
    });

    if (conflicts.length > 0) {
        lines.push("Conflicts:");
        conflicts.forEach((conflict) => {
            lines.push(`- ${formatConflictText(conflict)}`);
        });
        lines.push("");
    }

    if (unplaceableSubjects.length > 0) {
        lines.push("Unplaceable:");
        unplaceableSubjects.forEach((subject) => {
            lines.push(`- ${formatUnplaceableText(subject)}`);
        });
    }

    return lines.join("\n").trim();
}

function buildSubjectGroupsText(subjects) {
    const groupSummaries = getSubjectGroupSummary(subjects);
    if (groupSummaries.length === 0) return "";

    return [
        "KMITL Schedule Builder - Subject Groups",
        "",
        ...groupSummaries.flatMap((groupSummary) => {
            const representativeSubject = groupSummary.subjects[0];
            const subjectHeader = [
                getSubjectDisplayCode(representativeSubject),
                getSubjectDisplayName(representativeSubject),
            ].filter(Boolean).join(" ");

            return [
                subjectHeader,
                ...groupSummary.subjects.map((subject) => `- ${formatSubjectGroupTextLine(subject)}`),
                "",
            ];
        }),
    ].join("\n").trim();
}

function getSubjectsSortedByDayAndTime(subjects) {
    const subjectsByDay = new Map(TIMETABLE_DAYS.map((day) => [day, []]));

    getPlaceableSubjects(subjects).forEach((subject) => {
        const placement = getSubjectGridPlacement(subject);
        subjectsByDay.get(placement.day).push(subject);
    });

    TIMETABLE_DAYS.forEach((day) => {
        subjectsByDay.get(day).sort((firstSubject, secondSubject) => {
            return (
                timeToMinutes(getSubjectStartTime(firstSubject)) -
                timeToMinutes(getSubjectStartTime(secondSubject))
            );
        });
    });

    return subjectsByDay;
}

function formatSelectedClassHeading(subject) {
    return [
        getSubjectDisplayCode(subject),
        getSubjectDisplayName(subject),
    ].filter(Boolean).join(" ");
}

function formatSubjectTextLine(subject) {
    return [
        [getSubjectStartTime(subject), getSubjectEndTime(subject)].filter(Boolean).join(" - "),
        [
            getSubjectDisplayCode(subject),
            getSubjectDisplayName(subject),
        ].filter(Boolean).join(" "),
        getSubjectDisplayClassType(subject),
        subject.section ? `section(${subject.section})` : "",
        getSubjectDisplayLocation(subject),
    ].filter(Boolean).join(" | ");
}

function formatSubjectDetailedText(subject) {
    return [
        `Type: ${getSubjectDisplayClassType(subject)}`,
        subject.section ? `Section: ${subject.section}` : "",
        `Time: ${[getSubjectDisplayDay(subject), [getSubjectStartTime(subject), getSubjectEndTime(subject)].filter(Boolean).join(" - ")].filter(Boolean).join(" ") || "Unknown"}`,
        getSubjectDisplayLocation(subject) ? `Room: ${getSubjectDisplayLocation(subject)}` : "",
        subject.teacher ? `Teacher: ${subject.teacher}` : "",
    ].filter(Boolean);
}

function formatSubjectGroupTextLine(subject) {
    return [
        getSubjectDisplayClassType(subject),
        subject.section ? `section(${subject.section})` : "",
        getSubjectDisplayDay(subject),
        [getSubjectStartTime(subject), getSubjectEndTime(subject)].filter(Boolean).join(" - "),
    ].filter(Boolean).join(" | ");
}

function formatConflictText(conflict) {
    const conflictSubjects = conflict.subjects.map((subject) => {
        return [
            getSubjectDisplayName(subject),
            subject.section ? `section(${subject.section})` : "",
        ].filter(Boolean).join(" ");
    });

    return `${conflict.day} ${conflict.startTime} - ${conflict.endTime} | ${conflictSubjects.join(" vs ")}`;
}

function formatUnplaceableText(subject) {
    return [
        getSubjectDisplayName(subject),
        subject.section ? `section(${subject.section})` : "",
        [getSubjectDisplayDay(subject), [getSubjectStartTime(subject), getSubjectEndTime(subject)].filter(Boolean).join(" - ")].filter(Boolean).join(" ") || "Unknown day/time",
    ].filter(Boolean).join(" | ");
}

function renderUnplaceableSubjects(subjects) {
    const unplaceableSubjects = getUnplaceableSubjects(subjects);
    if (unplaceableSubjects.length === 0) return "";

    return `
    <div class="ksb-unplaceable-subjects">
        <div class="ksb-unplaceable-title">Cannot place on timetable</div>
        ${unplaceableSubjects.map(renderUnplaceableSubject).join("")}
    </div>
    `;
}

function renderUnplaceableSubject(subject) {
    const details = [
        getSubjectDisplayDay(subject),
        [getSubjectStartTime(subject), getSubjectEndTime(subject)].filter(Boolean).join(" - "),
        subject.section ? `section(${subject.section})` : "",
    ].filter(Boolean);

    return `
    <div class="ksb-unplaceable-subject">
        <strong>${escapeHtml(getSubjectDisplayName(subject))}</strong>
        ${details.length ? `<span>${details.map(escapeHtml).join(" | ")}</span>` : ""}
    </div>
    `;
}

function getTimetableSlots() {
    const slots = [];

    for (
        let minutes = TIMETABLE_START_MINUTE;
        minutes < TIMETABLE_END_MINUTE;
        minutes += TIMETABLE_SLOT_MINUTES
    ) {
        slots.push({
            minutes,
            label: minutesToTimeLabel(minutes),
            columnStart:
                TIMETABLE_FIRST_SLOT_COLUMN +
                (minutes - TIMETABLE_START_MINUTE) / TIMETABLE_SLOT_MINUTES,
        });
    }

    return slots;
}

function getPlaceableSubjects(subjects) {
    return subjects.filter(isSubjectPlaceable);
}

function getUnplaceableSubjects(subjects) {
    return subjects.filter((subject) => !isSubjectPlaceable(subject));
}

function isSubjectPlaceable(subject) {
    return getSubjectGridPlacement(subject).canPlace;
}

function getSubjectTimeRange(subject) {
    const placement = getSubjectGridPlacement(subject);
    if (!placement.canPlace) return null;

    const startMinutes = timeToMinutes(getSubjectStartTime(subject));
    const endMinutes = timeToMinutes(getSubjectEndTime(subject));
    if (startMinutes === null || endMinutes === null) return null;

    return {
        day: placement.day,
        startMinutes,
        endMinutes,
        startTime: getSubjectStartTime(subject),
        endTime: getSubjectEndTime(subject),
    };
}

function doTimeRangesOverlap(a, b) {
    if (!a || !b) return false;
    if (a.day !== b.day) return false;

    return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

function getSubjectConflicts(subjects) {
    const placeableSubjects = getPlaceableSubjects(subjects);
    const conflicts = [];

    for (let firstIndex = 0; firstIndex < placeableSubjects.length; firstIndex += 1) {
        for (
            let secondIndex = firstIndex + 1;
            secondIndex < placeableSubjects.length;
            secondIndex += 1
        ) {
            const firstSubject = placeableSubjects[firstIndex];
            const secondSubject = placeableSubjects[secondIndex];
            const firstRange = getSubjectTimeRange(firstSubject);
            const secondRange = getSubjectTimeRange(secondSubject);

            if (!doTimeRangesOverlap(firstRange, secondRange)) continue;

            const startMinutes = Math.min(firstRange.startMinutes, secondRange.startMinutes);
            const endMinutes = Math.max(firstRange.endMinutes, secondRange.endMinutes);

            conflicts.push({
                id: [firstSubject.id, secondSubject.id].sort().join("|"),
                day: firstRange.day,
                startTime: minutesToTimeLabel(startMinutes),
                endTime: minutesToTimeLabel(endMinutes),
                subjects: [firstSubject, secondSubject],
            });
        }
    }

    return conflicts;
}

function getConflictingSubjectIds(conflicts) {
    const subjectIds = new Set();

    conflicts.forEach((conflict) => {
        conflict.subjects.forEach((subject) => {
            if (subject.id) subjectIds.add(subject.id);
        });
    });

    return subjectIds;
}

function isSubjectConflicting(subject, conflictingSubjectIds) {
    return Boolean(subject.id && conflictingSubjectIds.has(subject.id));
}

function getSubjectGridPlacement(subject) {
    const day = normalizeDayKey(subject.day || subject.dayText);
    const startMinutes = timeToMinutes(getSubjectStartTime(subject));
    const endMinutes = timeToMinutes(getSubjectEndTime(subject));

    if (
        !TIMETABLE_DAYS.includes(day) ||
        startMinutes === null ||
        endMinutes === null ||
        endMinutes <= startMinutes ||
        startMinutes < TIMETABLE_START_MINUTE ||
        endMinutes > TIMETABLE_END_MINUTE ||
        (startMinutes - TIMETABLE_START_MINUTE) % TIMETABLE_SLOT_MINUTES !== 0 ||
        (endMinutes - startMinutes) % TIMETABLE_SLOT_MINUTES !== 0
    ) {
        return { canPlace: false };
    }

    return {
        canPlace: true,
        day,
        columnStart:
            TIMETABLE_FIRST_SLOT_COLUMN +
            (startMinutes - TIMETABLE_START_MINUTE) / TIMETABLE_SLOT_MINUTES,
        columnSpan: (endMinutes - startMinutes) / TIMETABLE_SLOT_MINUTES,
    };
}

function timeToMinutes(value) {
    const timeMatch = normalizeWhitespace(value).match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) return null;

    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (hours > 23 || minutes > 59) return null;

    return hours * 60 + minutes;
}

function minutesToTimeLabel(minutes) {
    const hours = Math.floor(minutes / 60);
    const minutePart = minutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutePart).padStart(2, "0")}`;
}

function renderSelectedSubjectCard(subject, conflictingSubjectIds = new Set()) {
    const subjectId = escapeHtml(subject.id || "");
    const code = getSubjectDisplayCode(subject);
    const metaParts = getSubjectCardMetaParts(subject)
        .map(escapeHtml)
        .join(" | ");
    const location = getSubjectDisplayLocation(subject);
    const teacher = normalizeWhitespace(subject.teacher);
    const rawText = String(subject.rawText || "").trim();
    const conflictClass = isSubjectConflicting(subject, conflictingSubjectIds)
        ? " ksb-selected-subject--conflict"
        : "";

    return `
    <div class="ksb-selected-subject${conflictClass}" data-ksb-selected-subject-id="${subjectId}">
        <div class="ksb-selected-subject-top">
            <div class="ksb-selected-subject-title">
                <div class="ksb-selected-subject-name">${escapeHtml(getSubjectDisplayName(subject))}</div>
                ${code ? `<div class="ksb-selected-subject-code">${escapeHtml(code)}</div>` : ""}
            </div>
            <button
                class="ksb-remove-subject-button"
                type="button"
                data-ksb-remove-subject-id="${subjectId}"
                aria-label="Remove selected subject"
            >
                Remove
            </button>
        </div>
        ${metaParts ? `<div class="ksb-selected-subject-meta">${metaParts}</div>` : ""}
        ${location ? `<div class="ksb-selected-subject-room">${escapeHtml(location)}</div>` : ""}
        ${teacher ? `<div class="ksb-selected-subject-teacher">${escapeHtml(teacher)}</div>` : ""}
        ${showRawTextDebug && rawText ? `<pre class="ksb-selected-subject-raw">${escapeHtml(rawText)}</pre>` : ""}
    </div>
    `;
}

async function removeSelectedSubject(subjectId) {
    if (!subjectId) return;

    const selectedSubjects = await getSelectedSubjects();
    const nextSubjects = selectedSubjects.filter((subject) => subject.id !== subjectId);

    await saveSelectedSubjects(nextSubjects);
    syncVisibleCheckboxState(subjectId, false);
    await renderSelectedSubjectPanel();
}

function syncVisibleCheckboxState(subjectId, checked) {
    document.querySelectorAll(".ksb-subject-checkbox").forEach((checkbox) => {
        if (checkbox.dataset.subjectId === subjectId) {
            checkbox.checked = checked;
        }
    });
}

function syncAllVisibleCheckboxes(selectedSubjects) {
    document.querySelectorAll(".ksb-subject-checkbox").forEach((checkbox) => {
        checkbox.checked = isSubjectSelected(checkbox.dataset.subjectId, selectedSubjects);
    });
}

function getSubjectCardMetaParts(subject) {
    const timeRange = [getSubjectStartTime(subject), getSubjectEndTime(subject)]
        .filter(Boolean)
        .join(" - ");

    return [
        subject.credits,
        subject.section ? `section(${subject.section})` : "",
        getSubjectDisplayClassType(subject),
        getSubjectDisplayDay(subject),
        timeRange,
    ].filter(Boolean);
}

function getSubjectDisplayCode(subject) {
    return subject.subjectCode || subject.code || "";
}

function getSubjectDisplayName(subject) {
    return subject.subjectName || subject.name || "Unknown Subject";
}

function getSubjectDisplayClassType(subject) {
    const classType = subject.classType || subject.type || "unknown";
    const labels = {
        theory: "ทฤษฎี",
        practical: "ปฏิบัติ",
        seminar: "สัมมนา",
        "ทฤษฎี": "ทฤษฎี",
        "ปฏิบัติ": "ปฏิบัติ",
        "สัมมนา": "สัมมนา",
        unknown: "ไม่ทราบประเภท",
    };

    return labels[classType] || labels.unknown;
}

function getSubjectDisplayDay(subject) {
    return subject.dayText || subject.day || "";
}

function getSubjectStartTime(subject) {
    return subject.startTime || subject.start || "";
}

function getSubjectEndTime(subject) {
    return subject.endTime || subject.end || "";
}

function getSubjectDisplayLocation(subject) {
    return [subject.room, subject.building].filter(Boolean).join(" / ");
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

init();
