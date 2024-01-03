export class Settings {

  popupButtonColor = 'f9f9f9';
  popupBackgroundColor = 'white';
  triggerOnMonitorChange = false;
  triggerOnWindowCreated = false;

  static load() {
    return chrome.storage.sync.get({settings: ''})
      .then(item => item.settings)
      .then(settings => (settings ?
                         Object.assign(new Settings(), JSON.parse(settings))
                         : new Settings()));
  }
}
