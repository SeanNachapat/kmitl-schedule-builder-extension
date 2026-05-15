/**
 * KMITL Schedule Builder — Calendar Export
 *
 * Google Calendar pre-filled URLs and iCal/ICS file export.
 */

async function ksbGetSemesterStart() {
    const stored = await ksbStorageGet(KSB_SEMESTER_START_KEY);
    return stored || null;
}

async function ksbSetSemesterStart(dateStr) {
    await ksbStorageSet(KSB_SEMESTER_START_KEY, dateStr);
}

function ksbRenderSemesterDatePicker(currentValue) {
    const val = currentValue || "";
    return `<div class="ksb-semester-picker">
        <label class="ksb-semester-label">${ksbRenderIcon("calendar")} Semester start
            <input type="date" class="ksb-semester-input" id="ksb-semester-start-input" value="${ksbEscapeHtml(val)}" />
        </label>
        <button type="button" class="ksb-section-toggle" id="ksb-semester-save">Save</button>
    </div>`;
}

function ksbFirstOccurrence(semesterStartStr, dayKey) {
    const start = new Date(semesterStartStr + "T00:00:00");
    if (isNaN(start.getTime())) return null;
    const targetIdx = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }[dayKey];
    if (targetIdx === undefined) return null;
    let diff = targetIdx - start.getDay();
    if (diff < 0) diff += 7;
    const result = new Date(start);
    result.setDate(result.getDate() + diff);
    return result;
}

function ksbFmtGcalDate(date, timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

function ksbBuildGoogleCalendarUrl(subject, semStart) {
    const day = ksbNormalizeDayKey(subject.day || subject.dayText);
    const st = ksbGetSubjectStartTime(subject);
    const et = ksbGetSubjectEndTime(subject);
    if (!day || !st || !et) return null;
    const first = ksbFirstOccurrence(semStart, day);
    if (!first) return null;
    const title = [ksbGetSubjectDisplayCode(subject), ksbGetSubjectDisplayName(subject),
        subject.section ? `sec(${subject.section})` : "", ksbGetSubjectDisplayClassType(subject)
    ].filter(Boolean).join(" — ");
    const loc = ksbGetSubjectDisplayLocation(subject);
    const desc = [`Professor: ${subject.teacher||"N/A"}`, `Section: ${subject.section||"N/A"}`,
        `Type: ${ksbGetSubjectDisplayClassType(subject)}`, `Code: ${ksbGetSubjectDisplayCode(subject)}`].join("\\n");
    const params = new URLSearchParams({ action:"TEMPLATE", text:title,
        dates:`${ksbFmtGcalDate(first,st)}/${ksbFmtGcalDate(first,et)}`,
        location:loc, details:desc, recur:"RRULE:FREQ=WEEKLY;COUNT=16" });
    return `https://calendar.google.com/calendar/r/eventtimesettings?${params.toString()}`;
}

function ksbIcalEsc(t) {
    return String(t||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
}

function ksbHashStr(s) {
    let h=0; for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;} return Math.abs(h).toString(36);
}

function ksbFmtIcalNow() {
    const d=new Date(), p=(n)=>String(n).padStart(2,"0");
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}Z`;
}

function ksbBuildIcsContent(subjects, semStart) {
    const evts = [];
    subjects.forEach((s) => {
        const day = ksbNormalizeDayKey(s.day||s.dayText);
        const st=ksbGetSubjectStartTime(s), et=ksbGetSubjectEndTime(s);
        if(!day||!st||!et) return;
        const first = ksbFirstOccurrence(semStart, day);
        if(!first) return;
        const title=[ksbGetSubjectDisplayCode(s),ksbGetSubjectDisplayName(s),s.section?`sec(${s.section})`:""].filter(Boolean).join(" — ");
        const loc=ksbGetSubjectDisplayLocation(s);
        const desc=[`Professor: ${s.teacher||"N/A"}`,`Type: ${ksbGetSubjectDisplayClassType(s)}`].join("\\n");
        const uid=`ksb-${ksbHashStr(s.id||title)}-${Date.now()}@kmitl`;
        evts.push(`BEGIN:VEVENT\r\nDTSTART:${ksbFmtGcalDate(first,st)}\r\nDTEND:${ksbFmtGcalDate(first,et)}\r\nRRULE:FREQ=WEEKLY;COUNT=16\r\nSUMMARY:${ksbIcalEsc(title)}\r\nLOCATION:${ksbIcalEsc(loc)}\r\nDESCRIPTION:${ksbIcalEsc(desc)}\r\nUID:${uid}\r\nDTSTAMP:${ksbFmtIcalNow()}\r\nEND:VEVENT`);
    });
    return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//KMITL Schedule Builder//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:KMITL Schedule\r\n${evts.join("\r\n")}\r\nEND:VCALENDAR`;
}

function ksbDownloadIcsFile(subjects, semStart) {
    const blob = new Blob([ksbBuildIcsContent(subjects, semStart)], {type:"text/calendar;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="kmitl-schedule.ics";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function ksbExportToGoogleCalendar(subjects) {
    const sem = await ksbGetSemesterStart();
    if(!sem) return {error:"Please set a semester start date first."};
    const urls = subjects.map(s=>ksbBuildGoogleCalendarUrl(s,sem)).filter(Boolean);
    if(!urls.length) return {error:"No subjects with valid day/time."};
    urls.forEach((u,i)=>setTimeout(()=>window.open(u,"_blank"),i*800));
    return {count:urls.length};
}

async function ksbExportToIcal(subjects) {
    const sem = await ksbGetSemesterStart();
    if(!sem) return {error:"Please set a semester start date first."};
    ksbDownloadIcsFile(subjects, sem);
    return {success:true};
}
