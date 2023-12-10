export class Settings {

  popupButtonColor = 'f9f9f9';
  popupBackgroundColor = 'white';
  triggerOnMonitorChange = false;
  triggerOnWindowCreated = false;

  static load() {
    return chrome.storage.sync.get({settings: ''})
      .then(item => item.settings)
      .then(settings => JSON.parse(settings))
      .then(json => Object.assign(new Settings(), json));
  }
}
