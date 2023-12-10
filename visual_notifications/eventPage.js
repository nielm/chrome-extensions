function onTabUpdated(tabId, changeInfo, tab) {
  if (changeInfo.audible) {
    chrome.windows.update(tab.windowId, {drawAttention: true});
  }
}

chrome.tabs.onUpdated.addListener(onTabUpdated)

