document.addEventListener('DOMContentLoaded', async () => {
    const gcalBtn = document.getElementById('quick-gcal');
    const icsBtn = document.getElementById('quick-ics');
    const statsDiv = document.getElementById('credit-summary');

    // Load credits if available
    const subjects = await ksbStorageGet(KSB_STORAGE_KEY) || [];
    if (subjects.length > 0) {
        statsDiv.innerHTML = `<strong>${subjects.length}</strong> subjects selected`;
    }

    // Export triggers
    gcalBtn.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, {action: 'exportGCal'});
        });
    });

    icsBtn.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, {action: 'exportICS'});
        });
    });
});
