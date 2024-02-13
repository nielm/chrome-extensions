import {Action} from './action.js';
import {Matcher} from './matcher.js';
import {Settings} from './settings.js';

/**
 * @typedef {Object} ValidatedConfiguration
 * @property {Action[]} actions
 * @property {Matcher[]} matchers
 * @property {Settings} settings
 * @property {boolean} valid
 * @property {string} actionsValidation
 * @property {string} matchersValidation
 * @property {string} settingsValidation
 */

/**
 * @typedef {Object} RawConfiguration
 * @property {string} actions
 * @property {string} matchers
 * @property {string} settings
 */

/** Session config key for the validated configuration */
const VALID_CONFIG_KEY = 'validConfig';

/** Storage class */
export class Storage {
  /** @type {Storage} */
  static #instance;

  /**
   * It will try to return existing instance of storage.
   *
   * Note that the same Storage class is used by worker and popup.
   * They don't share the instance.
   *
   * Config will try to be read from Session storage, and if it does not
   * exist, then read from Synced storage and copied into Session storage
   */
  constructor() {
    // Checking if the instance already exists
    if (Storage.#instance) {
      console.log('Storage instance returned');
      return Storage.#instance;
    }
    Storage.#instance = this;
    console.log('Storage instance created');

    /** @type {Promise<ValidatedConfiguration>} */
    this.validatedConfiguration = Storage.loadConfigFromStorage();
  }

  /**
   * Load config from storage. First try session storage, then read from synced.
   * @return {Promise<ValidatedConfiguration>}
   */
  static async loadConfigFromStorage() {
    const validConfig = /** @type {ValidatedConfiguration} */(
      (await chrome.storage.session.get({[VALID_CONFIG_KEY]: null}))[VALID_CONFIG_KEY]);

    if (validConfig?.valid) {
      console.info(`${new Date().toLocaleTimeString()} Valid config read from session storage`);

      // convert raw JS objects to classes.
      validConfig.actions = StorageFromJson.actionsFromObj(validConfig.actions);
      validConfig.matchers = StorageFromJson.matchersFromObj(validConfig.matchers);
      validConfig.settings = StorageFromJson.settingsFromObj(validConfig.settings);
      return validConfig;
    }
    // config in session store not present or not valid, try synced storage.
    return Storage.loadConfigFromSyncedStorage();
  }

  /**
   * Read config from synced storage, and update session storage copy.
   * @return {Promise<ValidatedConfiguration>}
   */
  static async loadConfigFromSyncedStorage() {
    const parsedConfig = Storage.parse((await Storage.getRawConfiguration()));

    if (parsedConfig.valid) {
      // update session storage.
      chrome.storage.session.set({[VALID_CONFIG_KEY]: parsedConfig});
      console.info(`${new Date().toLocaleTimeString()} Config read from synced storage, copied to session storage`);
      return parsedConfig;
    }

    // Should never get here because synced storage is perfect in every way!
    await chrome.storage.session.remove(VALID_CONFIG_KEY);
    return Promise.reject(
        new Error(`${new Date().toLocaleTimeString()
        } Failed parsing config from synced storage errors: actions:${
          parsedConfig.actionsValidation
        } matchers:${
          parsedConfig.matchersValidation
        } settings:${
          parsedConfig.settingsValidation
        }`));
  }

  /** refreshes local and session storage from synced storage */
  refreshConfigFromSyncedStorage() {
    this.validatedConfiguration = Storage.loadConfigFromSyncedStorage();
  }

  /**
   * Returns configuration as it was stored in the chrome.storage. It will try
   * to format it but it wont fail if the configuration is invalid.
   *
   * @return {Promise<RawConfiguration>}
   */
  static getRawConfiguration() {
    return chrome.storage.sync.get({actions: '[]', matchers: '[]', settings: '{}'})
        .then((item) => ({
          actions: Storage.#maybeFormat(item.actions),
          matchers: Storage.#maybeFormat(item.matchers),
          settings: Storage.#maybeFormat(item.settings),
        }));
  }

  /** @return {Promise<Action[]>} */
  getActions() {
    return this.validatedConfiguration.then((config) => config.actions);
  }

  /** @return {Promise<Matcher[]>} */
  getMatchers() {
    return this.validatedConfiguration.then((config) => config.matchers);
  }

  /** @return {Promise<Settings>} */
  getSettings() {
    return this.validatedConfiguration.then((config) => config.settings);
  }

  /**
   * Converts raw configuration into validated configuration that can be used to save the data.
   *
   * @param {RawConfiguration} configuration
   * @return {ValidatedConfiguration}
   */
  static parse(configuration) {
    /** @type {ValidatedConfiguration} */
    const result = {
      valid: true,
      actionsValidation: '',
      matchersValidation: '',
      settingsValidation: '',
      actions: [],
      matchers: [],
      settings: new Settings(),
    };

    try {
      result.actions = StorageFromJson.actions(configuration.actions);
    } catch (e) {
      result.actionsValidation = e.message;
      result.valid = false;
    }

    try {
      result.matchers = StorageFromJson.matchers(configuration.matchers);
    } catch (e) {
      result.matchersValidation = e.message;
      result.valid = false;
    }

    try {
      result.settings = StorageFromJson.settings(configuration.settings);
    } catch (e) {
      result.settingsValidation = e.message;
      result.valid = false;
    }

    if (result.valid === false) {
      return result;
    }

    try {
      result.actions.forEach((a) => a.validate());
    } catch (e) {
      result.actionsValidation = e.message;
      result.valid = false;
    }

    try {
      result.matchers.forEach((m) => m.validate());
    } catch (e) {
      result.matchersValidation = e.message;
      result.valid = false;
    }

    try {
      result.settings.validate();
    } catch (e) {
      result.settingsValidation = e.message;
      result.valid = false;
    }

    return result;
  }

  /**
   * Saves validated configuration to the synced storage.
   *
   * @param {ValidatedConfiguration} configuration
   * @return {Promise<void>}
   */
  static async save(configuration) {
    if (configuration.valid !== true) {
      throw new Error('Could not save invalid configuration');
    }

    // No need to update session storage - if anything is actually changed
    // the onChanged event handler in the service workers background.js
    // will refresh the session storage, and the Storage instance
    return chrome.storage.sync.set(
        {
          actions: StorageToJson.actions(configuration.actions, 0),
          matchers: StorageToJson.matchers(configuration.matchers, 0),
          settings: StorageToJson.settings(configuration.settings, 0),
        });
  }

  /**
   * It will try to format the string data but won't fail in case of problems.
   *
   * @param {string} value
   * @return {string}
   */
  static #maybeFormat(value) {
    try {
      return JSON.stringify(JSON.parse(value), undefined, 2);
    } catch (e) {
      console.warn(`Could not format JSON: ${e.message}`);
      return value;
    }
  }
}


/** StorageToJson class */
export class StorageToJson {
  /**
   * @param {Action[]} actions
   * @param {number} indent
   * @return {string}
   */
  static actions(actions, indent = 2) {
    return JSON.stringify(actions, undefined, indent);
  }

  /**
   * @param {Matcher[]} matchers
   * @param {number} indent
   * @return {string}
   */
  static matchers(matchers, indent = 2) {
    return JSON.stringify(matchers, undefined, indent);
  }

  /**
   * @param {Settings} settings
   * @param {number} indent
   * @return {string}
   */
  static settings(settings, indent = 2) {
    return JSON.stringify(settings, undefined, indent);
  }
}

/** StorageFromJson class */
class StorageFromJson {
  /**
   * @param {string} actions
   * @return {Action[]}
   */
  static actions(actions) {
    if (actions.trim().length===0) {
      throw new Error('Actions needs to be an array');
    }
    return this.actionsFromObj(JSON.parse(actions));
  }

  /**
   * @param {Object[]} actionsObj
   * @return {Action[]}
   */
  static actionsFromObj(actionsObj) {
    if (! (actionsObj instanceof Array)) {
      throw new Error('Actions needs to be an array');
    }
    return actionsObj.map((a) => Action.from(a));
  }

  /**
   * @param {string} matchers
   * @return {Matcher[]}
   */
  static matchers(matchers) {
    if (matchers.trim().length===0) {
      throw new Error('Matchers needs to be an array');
    }
    return this.matchersFromObj(JSON.parse(matchers));
  }

  /**
   * @param {Object[]} matchersObj
   * @return {Matcher[]}
   */
  static matchersFromObj(matchersObj) {
    if (! (matchersObj instanceof Array)) {
      throw new Error('Matchers needs to be an array');
    }
    return matchersObj.map((m) => Matcher.from(m)); ;
  }

  /**
   * @param {string} settings
   * @return {Settings}
   */
  static settings(settings) {
    if (settings.trim().length===0) {
      throw new Error('Settings needs to be an Object');
    }
    return this.settingsFromObj(JSON.parse(settings));
  }

  /**
   * @param {Object} settingsObj
   * @return {Settings}
   */
  static settingsFromObj(settingsObj) {
    if (! (settingsObj instanceof Object)) {
      throw new Error('Settings needs to be an Object');
    }
    return Settings.from(settingsObj);
  }
}
