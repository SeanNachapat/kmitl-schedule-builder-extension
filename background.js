// Background service worker for KMITL Schedule Builder
chrome.runtime.onInstalled.addListener(() => {
    console.log('KMITL Schedule Builder v0.3.0 installed');
});

// Listener for messages from popup or content scripts if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log') {
        console.log('[KSB LOG]', request.message);
    }
});
