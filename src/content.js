const STORAGE_KEY = "kmitl_schedule_builder_selected_subjects";
const EXTENSION_FLAG = "data-kmitl-schedule-builder-processed";
const EXTENSION_PROCESSED_VALUE = "true";
const CHECKBOX_WRAPPER_SELECTOR = ".ksb-checkbox-wrapper";
const SUBJECT_CARD_CANDIDATE_SELECTOR = "tbody tr, div, li, article, section";
const SUBJECT_ID_PATTERN = /\b\d{8}\b/;
const TIME_RANGE_PATTERN = /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/;
const SECTION_PATTERN = /section\s*\(([^)]+)\)/i;
let pageScanScheduled = false;

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
    <div id="ksb-selected-count">Selected: 0</div>
    <div id="ksb-timetable"></div>
	`;

    document.body.appendChild(panel);

    document
        .querySelector("#ksb-render-button")
        .addEventListener("click", renderTimetable);

    document
        .querySelector("#ksb-clear-button")
        .addEventListener("click", clearSelectedSubjects);

    renderTimetable();
}

function injectCheckboxesIntoSubjectCards() {
    const cards = findSubjectCards();

    cards.forEach((card, index) => {
        if (card.hasAttribute(EXTENSION_FLAG)) return;
        if (card.querySelector(CHECKBOX_WRAPPER_SELECTOR)) return;

        const subject = parseSubjectElement(card, index);
        if (!subject) return;

        card.setAttribute(EXTENSION_FLAG, EXTENSION_PROCESSED_VALUE);

        const checkboxWrapper = document.createElement("label");
        checkboxWrapper.className = "ksb-checkbox-wrapper";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "ksb-subject-checkbox";
        checkbox.dataset.subjectId = subject.id;

        checkbox.addEventListener("change", async () => {
            await toggleSelectedSubject(subject, checkbox.checked);
            await renderTimetable();
        });

        checkboxWrapper.appendChild(checkbox);
        checkboxWrapper.appendChild(document.createTextNode(" Add"));

        getCheckboxInjectionTarget(card).prepend(checkboxWrapper);
    });
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
     * KMITL DOM, replace SUBJECT_CARD_CANDIDATE_SELECTOR or add stable
     * selectors before the fallback heuristics below.
     *
     * The fallback must stay text-based for now:
     * - visible text contains section(...)
     * - visible text contains HH:mm - HH:mm
     */
    const candidates = [...document.querySelectorAll(SUBJECT_CARD_CANDIDATE_SELECTOR)]
        .filter((element) => element instanceof HTMLElement)
        .filter(isLikelySubjectCard);

    return candidates.filter((element) => {
        return !hasSubjectCardChild(element, candidates);
    });
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
    if (row.classList.contains("table-space-tr")) return false;

    const cells = getDirectTableCells(row);
    if (cells.length < 4) return false;

    const cellTexts = cells.map((cell) => normalizeText(cell.innerText));
    const subjectIdIndex = cellTexts.findIndex((text) => SUBJECT_ID_PATTERN.test(text));
    const timeIndex = cellTexts.findIndex((text) => TIME_RANGE_PATTERN.test(text));
    const hasSubjectId = subjectIdIndex !== -1;
    const hasTime = timeIndex !== -1;
    const hasSectionCell = cells.some((cell) => {
        const text = normalizeText(cell.innerText);
        return /^\d+[A-Z]?(?:\s*\([^)]+\))?$/i.test(text);
    });

    return hasSubjectId && hasTime && hasSectionCell && subjectIdIndex < timeIndex;
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

function parseSubjectElement(element, index) {
    if (element instanceof HTMLTableRowElement && isLikelyKmitlTableRow(element)) {
        return parseKmitlTableSubjectRow(element, index);
    }

    return parseSubjectCard(element, index);
}

function parseKmitlTableSubjectRow(row, index) {
    const cells = getDirectTableCells(row);
    const cellTexts = cells.map((cell) => normalizeText(cell.innerText));
    const subjectIdIndex = cellTexts.findIndex((text) => SUBJECT_ID_PATTERN.test(text));
    const timeIndex = cellTexts.findIndex((text) => TIME_RANGE_PATTERN.test(text));
    const sectionIndex = cellTexts.findIndex((text, cellIndex) => {
        return cellIndex > subjectIdIndex && /^\d+[A-Z]?(?:\s*\([^)]+\))?$/i.test(text);
    });

    if (subjectIdIndex === -1 || timeIndex === -1 || sectionIndex === -1) return null;

    const subjectId = cellTexts[subjectIdIndex].match(SUBJECT_ID_PATTERN)[0];
    const timeMatch = cellTexts[timeIndex].match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);

    if (!timeMatch) return null;

    return {
        id: `${subjectId}-${cellTexts[sectionIndex]}-${timeMatch[1]}-${timeMatch[2]}-${index}`,
        name: cellTexts[subjectIdIndex + 1] || extractSubjectName(row.innerText || ""),
        section: cellTexts[sectionIndex],
        type: extractSubjectType(row.innerText || ""),
        day: extractDay(cellTexts[timeIndex]),
        start: timeMatch[1],
        end: timeMatch[2],
        room: extractRoom(row.innerText || ""),
        rawText: row.innerText || "",
    };
}

function parseSubjectCard(card, index) {
    const text = card.innerText || "";

    const timeMatch = text.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    const sectionMatch = text.match(SECTION_PATTERN);

    if (!timeMatch || !sectionMatch) return null;

    const name = extractSubjectName(text);
    const type = extractSubjectType(text);

    return {
        id: `${name}-${sectionMatch[1]}-${timeMatch[1]}-${timeMatch[2]}-${index}`,
        name,
        section: sectionMatch[1],
        type,
        day: extractDay(text),
        start: timeMatch[1],
        end: timeMatch[2],
        room: extractRoom(text),
        rawText: text,
    };
}

function extractSubjectName(text) {
    const lines = text
        .split("\n")
        .map((line) => line.trim())
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

function extractSubjectType(text) {
    if (text.includes("ปฏิบัติ")) return "ปฏิบัติ";
    if (text.includes("Practice")) return "Practice";
    if (text.includes("Lecture")) return "Lecture";

    return "ทฤษฎี";
}

function extractDay(text) {
    const dayMatch = text.match(
        /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|วันจันทร์|วันอังคาร|วันพุธ|วันพฤหัสบดี|วันศุกร์|วันเสาร์|วันอาทิตย์)/i
    );

    return dayMatch ? dayMatch[1] : "Unknown";
}

function extractRoom(text) {
    const lines = text
        .split("\n")
        .map((line) => line.trim())
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

function getDirectTableCells(row) {
    return [...row.children].filter((child) => {
        return child instanceof HTMLTableCellElement;
    });
}

function normalizeText(value) {
    return String(value).replace(/\s+/g, " ").trim();
}

async function toggleSelectedSubject(subject, checked) {
    const selectedSubjects = await getSelectedSubjects();

    const nextSubjects = checked
        ? [
			...selectedSubjects.filter((item) => item.id !== subject.id),
			subject,
		]
        : selectedSubjects.filter((item) => item.id !== subject.id);

    await chrome.storage.local.set({
        [STORAGE_KEY]: nextSubjects,
    });
}

async function getSelectedSubjects() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
}

async function clearSelectedSubjects() {
    await chrome.storage.local.set({
        [STORAGE_KEY]: [],
    });

    document.querySelectorAll(".ksb-subject-checkbox").forEach((checkbox) => {
        checkbox.checked = false;
    });

    await renderTimetable();
}

async function renderTimetable() {
    const selectedSubjects = await getSelectedSubjects();

    const countElement = document.querySelector("#ksb-selected-count");
    const timetableElement = document.querySelector("#ksb-timetable");

    if (!countElement || !timetableElement) return;

    countElement.textContent = `Selected: ${selectedSubjects.length}`;

    if (selectedSubjects.length === 0) {
        timetableElement.innerHTML = `
		<div class="ksb-empty-state">
			Select subjects from the page to build your timetable.
		</div>
    `;
        return;
    }

    timetableElement.innerHTML = selectedSubjects
        .map((subject) => {
            return `
		<div class="ksb-selected-subject">
			<div class="ksb-selected-subject-name">${escapeHtml(subject.name)}</div>
			<div class="ksb-selected-subject-meta">
				${escapeHtml(subject.type)} |
				section(${escapeHtml(subject.section)}) |
				${escapeHtml(subject.start)} - ${escapeHtml(subject.end)}
			</div>
			<div class="ksb-selected-subject-room">${escapeHtml(subject.room)}</div>
        </div>
		`;
        })
        .join("");
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
