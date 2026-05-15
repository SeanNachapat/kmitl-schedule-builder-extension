/**
 * KMITL Schedule Builder — Real-time Credit Counter
 *
 * Parses credit strings (e.g. "3(3-0-6)") from selected subjects,
 * de-duplicates by subject code, and provides totals for lecture,
 * lab, and overall credits.
 */

const KSB_CREDIT_PATTERN = /(\d+)\s*\(\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*\)/;
const KSB_CREDIT_SIMPLE_PATTERN = /^(\d+)$/;

function ksbParseCredits(creditString) {
    const text = ksbNormalizeWhitespace(creditString);
    if (!text) return null;

    const fullMatch = text.match(KSB_CREDIT_PATTERN);
    if (fullMatch) {
        return {
            total: parseInt(fullMatch[1], 10),
            lecture: parseInt(fullMatch[2], 10),
            lab: parseInt(fullMatch[3], 10),
            selfStudy: parseInt(fullMatch[4], 10),
        };
    }

    const simpleMatch = text.match(KSB_CREDIT_SIMPLE_PATTERN);
    if (simpleMatch) {
        return {
            total: parseInt(simpleMatch[1], 10),
            lecture: parseInt(simpleMatch[1], 10),
            lab: 0,
            selfStudy: 0,
        };
    }

    return null;
}

function ksbAggregateCredits(subjects) {
    // De-duplicate by subject code so we don't double-count
    // theory + practical of the same subject
    const seenCodes = new Map();

    subjects.forEach((subject) => {
        const code = ksbGetSubjectDisplayCode(subject);
        if (!code) return;
        // Keep the first occurrence with parseable credits
        if (seenCodes.has(code)) return;
        const credits = ksbParseCredits(subject.credits);
        if (credits) {
            seenCodes.set(code, credits);
        }
    });

    const result = { total: 0, lecture: 0, lab: 0, selfStudy: 0, subjectCount: 0 };

    seenCodes.forEach((credits) => {
        result.total += credits.total;
        result.lecture += credits.lecture;
        result.lab += credits.lab;
        result.selfStudy += credits.selfStudy;
        result.subjectCount += 1;
    });

    return result;
}

function ksbRenderCreditCounter(subjects) {
    const agg = ksbAggregateCredits(subjects);
    if (agg.subjectCount === 0) return "";

    return `<div class="ksb-credit-counter">
        ${ksbRenderIcon("credits")}
        <span class="ksb-credit-total">${agg.total} credits</span>
        <span class="ksb-credit-breakdown">(${agg.lecture} lec · ${agg.lab} lab)</span>
        <span class="ksb-credit-subjects">${agg.subjectCount} subject${agg.subjectCount === 1 ? "" : "s"}</span>
    </div>`;
}
