document.addEventListener('DOMContentLoaded', async () => {
    const statsDiv = document.getElementById('credit-summary');

    // Load credits if available
    const subjects = await ksbStorageGet(KSB_STORAGE_KEY) || [];
    if (subjects.length > 0) {
        statsDiv.innerHTML = `<strong>${subjects.length}</strong> subjects selected`;
    }
});
