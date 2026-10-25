// Toolbar button and keyboard shortcut: ask the page's content script to show the panel.
// On unsupported sites there is no content script, so the button just explains that.

async function toggle(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;
  try {
    await chrome.tabs.sendMessage(tabId, 'threadpress:toggle');
    await chrome.action.setBadgeText({ tabId, text: '' });
  } catch {
    await chrome.action.setBadgeText({ tabId, text: '?' });
    await chrome.action.setTitle({
      tabId,
      title: 'ThreadPress works on ChatGPT, Claude, Gemini, Grok, DeepSeek and Kimi',
    });
  }
}

chrome.action.onClicked.addListener((tab) => void toggle(tab.id));

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-panel') void toggle(tab?.id);
});
