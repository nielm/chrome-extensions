function checkNotificationsOnState(details) {
  if (details.reason == 'install' || details.reason == 'update') {
    console.log(new Date() + ' CheckNotifications OnState: ' + details.reason);

    chrome.contentSettings.notifications.set({
      primaryPattern: '*://*.google.com:*/*',
      setting: 'allow',
    });

    chrome.contentSettings.notifications.set({
      primaryPattern: 'https://www.messenger.com/*',
      setting: 'allow',
    });

    chrome.contentSettings.notifications.set({
      primaryPattern: 'https://web.skype.com/*',
      setting: 'allow',
    });

    chrome.contentSettings.notifications.set({
      primaryPattern: 'https://web.whatsapp.com/*',
      setting: 'allow',
    });

    chrome.contentSettings.notifications.set({
      primaryPattern: 'https://open.spotify.com/*',
      setting: 'allow',
    });

    chrome.contentSettings.notifications.set({
      primaryPattern: 'https://www.bennish.net/*',
      setting: 'allow',
    });

    chrome.contentSettings.notifications.set({
      primaryPattern: '<all_urls>',
      setting: 'block',
    });
  }
}


chrome.runtime.onInstalled.addListener(checkNotificationsOnState);
