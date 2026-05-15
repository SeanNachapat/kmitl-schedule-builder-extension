document.addEventListener('DOMContentLoaded', async () => {
    const themeBtn = document.getElementById('toggle-dark-mode');
    const themeStatus = document.getElementById('theme-status');
    const gcalBtn = document.getElementById('quick-gcal');
    const icsBtn = document.getElementById('quick-ics');
    const statsDiv = document.getElementById('credit-summary');

    // Load initial theme
    const theme = await ksbStorageGet(KSB_THEME_KEY);
    updateThemeUI(theme === 'dark');

    // Load credits if available
    const subjects = await ksbStorageGet(KSB_STORAGE_KEY) || [];
    if (subjects.length > 0) {
        // Logic to calculate credits would normally go here, but for the popup
        // we'll just show a simplified count.
        statsDiv.innerHTML = `<strong>${subjects.length}</strong> subjects selected`;
    }

    themeBtn.addEventListener('click', async () => {
        const current = await ksbStorageGet(KSB_THEME_KEY);
        const next = current === 'dark' ? 'light' : 'dark';
        await ksbStorageSet(KSB_THEME_KEY, next);
        updateThemeUI(next === 'dark');
        
        // Notify content scripts to update
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, {action: 'updateTheme', theme: next});
        });
    });

    function updateThemeUI(isDark) {
        document.body.classList.toggle('dark', isDark);
        themeStatus.textContent = isDark ? 'On' : 'Off';
    }

    // Export triggers (would normally require semester date check)
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
