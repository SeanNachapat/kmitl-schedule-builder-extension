/**
 * KMITL Schedule Builder — Enhanced Conflict Checker
 *
 * Extends the existing conflict detection with alternative section
 * suggestions.  Scans all visible (unselected) table rows for
 * same-subject sections that don't conflict with the rest of the
 * schedule.
 */

/**
 * Cached list of all parsed rows on the page (updated every scan).
 * Populated from content.js during injectCheckboxesIntoSubjectCards.
 */
let ksbAllParsedRows = [];

function ksbSetAllParsedRows(rows) {
    ksbAllParsedRows = rows;
}

/**
 * Find alternative sections for a conflicting subject.
 * @param {Object} conflictingSubject — the subject that has a conflict
 * @param {Array} selectedSubjects — current selection
 * @returns {Array} up to 3 alternative section objects
 */
function ksbFindAlternativeSections(conflictingSubject, selectedSubjects) {
    const subjectCode = ksbGetSubjectDisplayCode(conflictingSubject);
    if (!subjectCode) return [];

    const classType = conflictingSubject.classType || conflictingSubject.type || "unknown";

    // Other selected subjects (excluding the conflicting one)
    const otherSelected = selectedSubjects.filter((s) => s.id !== conflictingSubject.id);

    // Find all rows on the page with the same subject code and class type
    const candidates = ksbAllParsedRows.filter((row) => {
        if (!row || !row.id) return false;
        // Same subject code
        if (ksbGetSubjectDisplayCode(row) !== subjectCode) return false;
        // Same class type
        const rowType = row.classType || row.type || "unknown";
        if (rowType !== classType) return false;
        // Not already selected
        if (selectedSubjects.some((s) => s.id === row.id)) return false;
        // Must be placeable
        const placement = ksbGetAlternativePlacement(row);
        if (!placement) return false;
        return true;
    });

    // Filter to only non-conflicting alternatives
    const alternatives = candidates.filter((candidate) => {
        const candRange = ksbGetAlternativeTimeRange(candidate);
        if (!candRange) return false;

        return !otherSelected.some((other) => {
            const otherRange = ksbGetAlternativeTimeRange(other);
            if (!otherRange) return false;
            return ksbDoRangesOverlap(candRange, otherRange);
        });
    });

    return alternatives.slice(0, 3);
}

function ksbGetAlternativePlacement(subject) {
    const day = ksbNormalizeDayKey(subject.day || subject.dayText);
    const startMinutes = ksbTimeToMinutes(ksbGetSubjectStartTime(subject));
    const endMinutes = ksbTimeToMinutes(ksbGetSubjectEndTime(subject));

    if (
        !KSB_TIMETABLE_DAYS.includes(day) ||
        startMinutes === null ||
        endMinutes === null ||
        endMinutes <= startMinutes
    ) {
        return null;
    }
    return { day, startMinutes, endMinutes };
}

function ksbGetAlternativeTimeRange(subject) {
    const day = ksbNormalizeDayKey(subject.day || subject.dayText);
    const startMinutes = ksbTimeToMinutes(ksbGetSubjectStartTime(subject));
    const endMinutes = ksbTimeToMinutes(ksbGetSubjectEndTime(subject));
    if (!day || startMinutes === null || endMinutes === null) return null;
    return { day, startMinutes, endMinutes };
}

function ksbDoRangesOverlap(a, b) {
    if (a.day !== b.day) return false;
    return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

function ksbRenderAlternativeSuggestions(conflict, selectedSubjects) {
    const suggestions = [];

    conflict.subjects.forEach((subject) => {
        const alternatives = ksbFindAlternativeSections(subject, selectedSubjects);
        if (alternatives.length === 0) return;

        suggestions.push({
            originalSubject: subject,
            alternatives,
        });
    });

    if (suggestions.length === 0) return "";

    return suggestions.map((suggestion) => {
        const alts = suggestion.alternatives.map((alt) => {
            const dayLabel = ksbGetSubjectDisplayDay(alt) || alt.day;
            const time = `${ksbGetSubjectStartTime(alt)} - ${ksbGetSubjectEndTime(alt)}`;
            const section = alt.section ? `section(${alt.section})` : "";

            return `<div class="ksb-alternative-item">
                <span class="ksb-alternative-info">
                    ${ksbEscapeHtml([section, dayLabel, time].filter(Boolean).join(" · "))}
                </span>
                <button
                    class="ksb-alternative-swap"
                    type="button"
                    data-ksb-swap-from="${ksbEscapeHtml(suggestion.originalSubject.id)}"
                    data-ksb-swap-to='${ksbEscapeHtml(JSON.stringify(alt))}'
                    aria-label="Swap to this section"
                >${ksbRenderIcon("swap")} Swap</button>
            </div>`;
        }).join("");

        return `<div class="ksb-alternatives-section">
            <div class="ksb-alternatives-label">Alternatives for ${ksbEscapeHtml(ksbGetSubjectDisplayName(suggestion.originalSubject))} section(${ksbEscapeHtml(suggestion.originalSubject.section || "?")}):</div>
            ${alts}
        </div>`;
    }).join("");
}
