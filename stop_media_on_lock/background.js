function onIdle(newIdleState) {
  console.log(newIdleState);
  if (newIdleState === "locked") {
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(function(tab) {
        if (tab.audible) {
          console.log("Muting tab: " + tab.url);
          chrome.scripting.executeScript({
              target: {tabId: tab.id, allFrames: true},
              files: ["stop_music.js"]
          });
        }
      });
    });
  }
}

chrome.idle.onStateChanged.addListener(onIdle);
