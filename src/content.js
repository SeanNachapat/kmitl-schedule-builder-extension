const STORAGE_KEY = "kmitl_schedule_builder_selected_subjects";
const EXTENSION_FLAG = "data-kmitl-schedule-builder-processed";

function init() {
    observePageChanges();
    injectExtensionUi();
}

function observePageChanges() {
    const observer = new MutationObserver(() => {
        injectCheckboxesIntoSubjectCards();
        injectExtensionUi();
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

        const subject = parseSubjectCard(card, index);
        if (!subject) return;

        card.setAttribute(EXTENSION_FLAG, "true");

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

        card.prepend(checkboxWrapper);
    });
}

function findSubjectCards() {
    return [...document.querySelectorAll("div")].filter((element) => {
        const text = element.innerText || "";

        const hasSection = /section\s*\([^)]+\)/i.test(text);
        const hasTime = /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(text);

        return hasSection && hasTime;
    });
}

function parseSubjectCard(card, index) {
    const text = card.innerText || "";

    const timeMatch = text.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    const sectionMatch = text.match(/section\s*\(([^)]+)\)/i);

    if (!timeMatch || !sectionMatch) return null;

    const name = extractSubjectName(text);
    const type = text.includes("ปฏิบัติ") ? "ปฏิบัติ" : "ทฤษฎี";

    return {
        id: `${name}-${sectionMatch[1]}-${timeMatch[1]}-${timeMatch[2]}-${index}`,
        name,
        section: sectionMatch[1],
        type,
        day: "Unknown",
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
