/**
 * KMITL Schedule Builder — Share & Compare
 *
 * JSON export/import, shareable link generation, and compare mode.
 */

function ksbBuildShareableData(subjects) {
    return subjects.map((s) => ({
        c: ksbGetSubjectDisplayCode(s),
        n: ksbGetSubjectDisplayName(s),
        s: s.section || "",
        t: s.classType || s.type || "",
        d: s.day || "",
        dt: s.dayText || "",
        st: ksbGetSubjectStartTime(s),
        et: ksbGetSubjectEndTime(s),
        r: s.room || "",
        b: s.building || "",
        te: s.teacher || "",
        cr: s.credits || "",
    }));
}

function ksbDecodeShareableData(compactArr) {
    if (!Array.isArray(compactArr)) return [];
    return compactArr.map((item) => {
        const subject = {
            id: "", subjectCode: item.c || "", subjectName: item.n || "",
            credits: item.cr || "", section: item.s || "",
            classType: item.t || "unknown", day: item.d || "",
            dayText: item.dt || "", startTime: item.st || "",
            endTime: item.et || "", room: item.r || "",
            building: item.b || "", teacher: item.te || "",
            examInfo: "", condition: "", note: "",
            capacity: "", enrolled: "", queue: "", registered: "", rawText: "",
        };
        subject.id = ksbCreateShareSubjectId(subject);
        return subject;
    });
}

function ksbCreateShareSubjectId(s) {
    return [s.subjectCode, s.section, s.classType, s.day, s.startTime, s.endTime, s.room, s.building]
        .map((v) => ksbNormalizeSubjectIdPart(v || "")).filter(Boolean).join("|");
}

function ksbEncodeShareLink(subjects) {
    try {
        const data = ksbBuildShareableData(subjects);
        const json = JSON.stringify(data);
        const encoded = btoa(unescape(encodeURIComponent(json)));
        return `${window.location.origin}${window.location.pathname}#ksb-share=${encoded}`;
    } catch (e) {
        console.warn("[KSB] Share encoding failed:", e);
        return null;
    }
}

function ksbDecodeShareFragment() {
    const hash = window.location.hash;
    const prefix = "#ksb-share=";
    if (!hash.startsWith(prefix)) return null;
    try {
        const encoded = hash.substring(prefix.length);
        const json = decodeURIComponent(escape(atob(encoded)));
        return ksbDecodeShareableData(JSON.parse(json));
    } catch (e) {
        console.warn("[KSB] Share decoding failed:", e);
        return null;
    }
}

function ksbExportScheduleJson(subjects) {
    const data = { version: "0.3.0", exported: new Date().toISOString(), subjects: ksbBuildShareableData(subjects) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "kmitl-schedule.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function ksbImportScheduleJson(fileContent) {
    try {
        const data = JSON.parse(fileContent);
        if (data.subjects && Array.isArray(data.subjects)) {
            return ksbDecodeShareableData(data.subjects);
        }
        if (Array.isArray(data)) {
            return ksbDecodeShareableData(data);
        }
        return null;
    } catch (e) {
        console.warn("[KSB] JSON import failed:", e);
        return null;
    }
}

function ksbRenderCompareView(mySubjects, friendSubjects) {
    if (!friendSubjects || friendSubjects.length === 0) return "";

    const mySlots = ksbCollectTimeSlots(mySubjects);
    const friendSlots = ksbCollectTimeSlots(friendSubjects);

    // Find shared free time
    const sharedFree = [];
    KSB_TIMETABLE_DAYS.forEach((day) => {
        for (let m = KSB_TIMETABLE_START_MINUTE; m < KSB_TIMETABLE_END_MINUTE; m += KSB_TIMETABLE_SLOT_MINUTES) {
            const key = `${day}-${m}`;
            if (!mySlots.has(key) && !friendSlots.has(key)) {
                sharedFree.push({ day, time: ksbMinutesToTimeLabel(m) });
            }
        }
    });

    // Group consecutive free slots
    const freeRanges = ksbGroupConsecutiveSlots(sharedFree);

    return `<div class="ksb-compare-section">
        <div class="ksb-compare-title">${ksbRenderIcon("compare")} Schedule Comparison</div>
        <div class="ksb-compare-stats">
            <span>Your classes: ${mySubjects.length}</span>
            <span>Friend's classes: ${friendSubjects.length}</span>
            <span>Shared free slots: ${freeRanges.length}</span>
        </div>
        ${freeRanges.length > 0 ? `<div class="ksb-compare-free">
            <strong>Shared free time:</strong>
            ${freeRanges.slice(0, 10).map((r) => `<span class="ksb-free-slot">${ksbEscapeHtml(r.day)} ${ksbEscapeHtml(r.start)} - ${ksbEscapeHtml(r.end)}</span>`).join("")}
            ${freeRanges.length > 10 ? `<em>...and ${freeRanges.length - 10} more</em>` : ""}
        </div>` : "<div class='ksb-compare-no-free'>No shared free time found.</div>"}
    </div>`;
}

function ksbCollectTimeSlots(subjects) {
    const slots = new Set();
    subjects.forEach((s) => {
        const day = ksbNormalizeDayKey(s.day || s.dayText);
        const startM = ksbTimeToMinutes(ksbGetSubjectStartTime(s));
        const endM = ksbTimeToMinutes(ksbGetSubjectEndTime(s));
        if (!day || startM === null || endM === null) return;
        for (let m = startM; m < endM; m += KSB_TIMETABLE_SLOT_MINUTES) {
            slots.add(`${day}-${m}`);
        }
    });
    return slots;
}

function ksbGroupConsecutiveSlots(slots) {
    if (slots.length === 0) return [];
    const ranges = [];
    let current = null;
    slots.forEach((slot) => {
        const m = ksbTimeToMinutes(slot.time);
        if (current && current.day === slot.day && m === ksbTimeToMinutes(current.lastTime) + KSB_TIMETABLE_SLOT_MINUTES) {
            current.lastTime = slot.time;
            current.end = ksbMinutesToTimeLabel(m + KSB_TIMETABLE_SLOT_MINUTES);
        } else {
            if (current) ranges.push(current);
            current = { day: slot.day, start: slot.time, end: ksbMinutesToTimeLabel(m + KSB_TIMETABLE_SLOT_MINUTES), lastTime: slot.time };
        }
    });
    if (current) ranges.push(current);
    return ranges;
}

function ksbRenderSharePanel() {
    return `<div class="ksb-share-panel">
        <button class="ksb-export-button" type="button" data-ksb-action="copy-share-link">${ksbRenderIcon("share")} Copy Share Link</button>
        <button class="ksb-export-button" type="button" data-ksb-action="export-json">${ksbRenderIcon("download")} Export JSON</button>
        <button class="ksb-export-button" type="button" data-ksb-action="import-json">${ksbRenderIcon("upload")} Import JSON</button>
        <input type="file" id="ksb-json-file-input" accept=".json" style="display:none" />
    </div>`;
}
