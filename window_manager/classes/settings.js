export class Settings {
  /** @type {string} */
  popupButtonColor = 'f9f9f9';

  /** @type {string} */
  popupBackgroundColor = 'white';

  /** @type {boolean} */
  triggerOnMonitorChange = false;

  /** @type {boolean} */
  triggerOnWindowCreated = false;

  /**
   * @return {Promise<Settings>}
   */
  static load() {
    return chrome.storage.sync.get({settings: '{}'})
        .then((item) => item.settings)
        .then((settings) => (settings ?
                         Object.assign(new Settings(), JSON.parse(settings)) :
                         new Settings()));
  }

  /**
   * @param {*} json
   * @return {void}
   */
  static validate(json) {
    Settings.validateClass(new Settings(), json, ['popupButtonColor', 'popupBackgroundColor', 'triggerOnMonitorChange', 'triggerOnWindowCreated']);
  }

  /**
   * @param {Object} obj
   * @param {*} json
   * @param {string[]} optionalKeys
   * @return {void}
   */
  static validateClass(obj, json, optionalKeys = []) {
    const jsonKeys = new Set(Object.keys(json));
    const objKeys = new Set(Object.keys(obj));
    for (const optionalKey of optionalKeys) {
      jsonKeys.delete(optionalKey);
      objKeys.delete(optionalKey);
    }
    // At this point both sets do not contain optional keys.
    objKeys.forEach(
        (objKey) => {
          if (!jsonKeys.delete(objKey)) {
            throw new Error(`Missing property: ${objKey}`);
          }
        });
    // At this point jsonKeys set should be empty
    if (jsonKeys.size !== 0) {
      throw new Error(`Unexpected properties: ${[...jsonKeys]}`);
    }

    for (const key of Object.keys(json)) {
      if (json[key] !== 0 && !json[key]) {
        throw new Error(`Property is missing value: json[${key}]=${json[key]}.`);
      }
    }
  }
}
