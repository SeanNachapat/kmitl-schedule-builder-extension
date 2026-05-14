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
let pageScanScheduled = false;
let checkboxInjectionInProgress = false;
let checkboxInjectionPending = false;
let showRawTextDebug = false;

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
    if (document.querySelector("#kmitl-schedule-builder-panel")) return;

    const panel = document.createElement("div");
    panel.id = "kmitl-schedule-builder-panel";

    panel.innerHTML = `
    <div class="ksb-panel-header">
		<strong>KMITL Schedule Builder</strong>
		<div class="ksb-panel-actions">
			<button id="ksb-render-button">Render</button>
			<button id="ksb-clear-button">Clear</button>
		</div>
    </div>
    <div class="ksb-panel-toolbar">
        <div id="ksb-selected-count">Selected: 0</div>
        <label class="ksb-debug-toggle">
            <input id="ksb-debug-toggle" type="checkbox">
            Debug raw text
        </label>
    </div>
    <div id="ksb-timetable"></div>
	`;

    document.body.appendChild(panel);

    document
        .querySelector("#ksb-render-button")
        .addEventListener("click", renderTimetable);

    document
        .querySelector("#ksb-clear-button")
        .addEventListener("click", clearSelectedSubjects);

    panel.addEventListener("click", async (event) => {
        if (!(event.target instanceof Element)) return;

        const removeButton = event.target.closest("[data-ksb-remove-subject-id]");
        if (!(removeButton instanceof HTMLElement)) return;

        await removeSelectedSubject(removeButton.dataset.ksbRemoveSubjectId);
    });

    panel.addEventListener("change", async (event) => {
        if (!(event.target instanceof HTMLInputElement)) return;
        if (event.target.id !== "ksb-debug-toggle") return;

        showRawTextDebug = event.target.checked;
        await renderTimetable();
    });

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

    await saveSelectedSubjects(nextSubjects);
}

async function getSelectedSubjects() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const selectedSubjects = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    const normalizedSubjects = normalizeSelectedSubjects(selectedSubjects);

    if (normalizedSubjects.length !== selectedSubjects.length) {
        await saveSelectedSubjects(normalizedSubjects);
    }

    return normalizedSubjects;
}

async function saveSelectedSubjects(subjects) {
    await chrome.storage.local.set({
        [STORAGE_KEY]: normalizeSelectedSubjects(subjects),
    });
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

async function renderSelectedSubjectPanel() {
    const selectedSubjects = await getSelectedSubjects();

    const countElement = document.querySelector("#ksb-selected-count");
    const timetableElement = document.querySelector("#ksb-timetable");
    const debugToggle = document.querySelector("#ksb-debug-toggle");

    if (!countElement || !timetableElement) return;

    syncAllVisibleCheckboxes(selectedSubjects);
    countElement.textContent = `Selected: ${selectedSubjects.length}`;
    if (debugToggle) debugToggle.checked = showRawTextDebug;

    timetableElement.innerHTML = renderSelectedSubjectList(selectedSubjects);
}

function renderSelectedSubjectList(subjects) {
    if (subjects.length === 0) {
        return `
        <div class="ksb-empty-state">
            Select class rows from the table to build your timetable.
        </div>
        `;
    }

    return subjects.map(renderSelectedSubjectCard).join("");
}

function renderSelectedSubjectCard(subject) {
    const subjectId = escapeHtml(subject.id || "");
    const code = getSubjectDisplayCode(subject);
    const metaParts = getSubjectCardMetaParts(subject)
        .map(escapeHtml)
        .join(" | ");
    const location = getSubjectDisplayLocation(subject);
    const teacher = normalizeWhitespace(subject.teacher);
    const rawText = String(subject.rawText || "").trim();

    return `
    <div class="ksb-selected-subject" data-ksb-selected-subject-id="${subjectId}">
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
