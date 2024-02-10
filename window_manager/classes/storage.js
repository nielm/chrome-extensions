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

/** Storage class */
export class Storage {
  /** @type {Storage} */
  static #instance;

  /**
   * It will try to return existing instance of storage.
   *
   * Note that the same Storage class is used by worker, popup and options. They don't share the namespace.
   */
  constructor() {
    // Checking if the instance already exists
    if (Storage.#instance) {
      console.log('Storage instance returned');
      return Storage.#instance;
    }
    Storage.#instance = this;
    console.log('Storage instance created');
  }

  /**
   * Returns configuration as it was stored in the chrome.storage. It will try
   * to format it but it wont fail if the configuration is invalid.
   *
   * @return {Promise<RawConfiguration>}
   */
  async getRawConfiguration() {
    return chrome.storage.sync.get({actions: '[]', matchers: '[]', settings: '{}'})
        .then((item) => ({
          actions: Storage.#maybeFormat(item.actions),
          matchers: Storage.#maybeFormat(item.matchers),
          settings: Storage.#maybeFormat(item.settings),
        }));
  }

  /**
   * Returns actions from the storage.
   * Note: this method is not performing any validation as the data in the storage
   *       should be valid.
   *
   * @return {Promise<Action[]>}
   */
  async getActions() {
    return chrome.storage.sync.get({actions: '[]'}).then((item) => item.actions).then(StorageFromJson.actions);
  }

  /**
   * Returns matchers from the storage.
   * Note: this method is not performing any validation as the data in the storage
   *       should be valid.
   *
   * @return {Promise<Matcher[]>}
   */
  async getMatchers() {
    return chrome.storage.sync.get({matchers: '[]'}).then((item) => item.matchers).then(StorageFromJson.matchers);
  }

  /**
   * Returns settings from the storage.
   * Note: this method is not performing any validation as the data in the storage
   *       should be valid.
   *
   * @return {Promise<Settings>}
   */
  async getSettings() {
    return chrome.storage.sync.get({settings: '{}'}).then((item) => item.settings).then(StorageFromJson.settings);
  }

  /**
   * Converts raw configuration into validated configuration that can be used to save the data.
   *
   * @param {RawConfiguration} configuration
   * @return {ValidatedConfiguration}
   */
  parse(configuration) {
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
   * Saves validated configuration to the storage.
   *
   * @param {ValidatedConfiguration} configuration
   * @return {Promise<void>}
   */
  async save(configuration) {
    if (configuration.valid !== true) {
      throw new Error('Could not save invalid configuration');
    }
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
    return JSON.parse(actions).map((a) => Action.from(a));
  }

  /**
   * @param {string} matchers
   * @return {Matcher[]}
   */
  static matchers(matchers) {
    return JSON.parse(matchers).map((m) => Matcher.from(m)); ;
  }

  /**
   * @param {string} settings
   * @return {Settings}
   */
  static settings(settings) {
    return Settings.from(JSON.parse(settings));
  }
}
