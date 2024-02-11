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
 * @property {?number} actionsStoredSize
 * @property {?number} matchersStoredSize
 * @property {?number} settingsStoredSize
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
    const item = await chrome.storage.sync.get({actions: '[]', matchers: '[]', settings: '{}'});
    return {
      actions: Storage.#maybeFormat(await Storage.tryDecompress(item.actions)),
      matchers: Storage.#maybeFormat(await Storage.tryDecompress(item.matchers)),
      settings: Storage.#maybeFormat(item.settings),
    };
  }

  /**
   * Returns actions from the storage.
   * Note: this method is not performing any validation as the data in the storage
   *       should be valid.
   *
   * @return {Promise<Action[]>}
   */
  async getActions() {
    const item = await chrome.storage.sync.get({actions: '[]'});
    return StorageFromJson.actions(await Storage.tryDecompress(item.actions));
  }

  /**
   * Returns matchers from the storage.
   * Note: this method is not performing any validation as the data in the storage
   *       should be valid.
   *
   * @return {Promise<Matcher[]>}
   */
  async getMatchers() {
    const item = await chrome.storage.sync.get({matchers: '[]'});
    return StorageFromJson.matchers(await Storage.tryDecompress(item.matchers));
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
   * @return {Promise<ValidatedConfiguration>}
   */
  async parse(configuration) {
    /** @type {ValidatedConfiguration} */
    const result = {
      valid: true,
      actionsValidation: '',
      matchersValidation: '',
      settingsValidation: '',
      actions: [],
      matchers: [],
      settings: new Settings(),
      actionsStoredSize: null,
      matchersStoredSize: null,
      settingsStoredSize: null,
    };

    try {
      result.actions = StorageFromJson.actions(configuration.actions);

      const stored = await Storage.stringToBase64Gzipped(JSON.stringify(result.actions, undefined, 0));
      result.actionsStoredSize = new TextEncoder().encode(stored).length + 'actions  '.length;
    } catch (e) {
      result.actionsValidation = e.message;
      result.valid = false;
    }

    try {
      result.matchers = StorageFromJson.matchers(configuration.matchers);
      const stored = await Storage.stringToBase64Gzipped(JSON.stringify(result.matchers, undefined, 0));
      result.matchersStoredSize = new TextEncoder().encode(stored).length+ 'matchers  '.length;
    } catch (e) {
      result.matchersValidation = e.message;
      result.valid = false;
    }

    try {
      result.settings = StorageFromJson.settings(configuration.settings);
      const stored = JSON.stringify({settings: StorageToJson.settings(result.settings, 0)});
      result.settingsStoredSize = new TextEncoder().encode(stored).length;
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
    await chrome.storage.sync.set(
        {
          actions: await Storage.stringToBase64Gzipped(StorageToJson.actions(configuration.actions, 0)),
          matchers: await Storage.stringToBase64Gzipped(StorageToJson.matchers(configuration.matchers, 0)),
          settings: StorageToJson.settings(configuration.settings, 0),
        });

    console.log(`Stored actions size: estimated: ${configuration.actionsStoredSize}, actual: ${await chrome.storage.sync.getBytesInUse('actions')}`);
    console.log(`Stored matcher size: estimated: ${configuration.matchersStoredSize}, actual: ${await chrome.storage.sync.getBytesInUse('matchers')}`);
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

  /**
   * Checks if str is a JSON object, if not, try to decompress it.
   *
   * @param {String} str
   * @return {Promise<String>}
   */
  static async tryDecompress(str) {
    // stored data can be a JSON object, in which case it starts with
    // '{' or '['.
    // or a base64-encoded, gzipped, compressed JSON object...
    // as base64 will never contain '[' or '{', we can use that as a check.
    //
    str=str.trim(); // just in case...
    if (str[0] === '{' || str[0] === '[' ) {
      // assume JSON
      return str;
    }
    try {
      return await Storage.base64GzippedToString(str);
    } catch (e) {
      console.warn('failed to decode base64-gip, assume bad JSON'+e.message);
      return str;
    }
  }

  /**
   * Function to decode a base64-encoded gzipped string
   * @param {String} base64String
   * @return {Promise<String>}
  */
  static async base64GzippedToString(base64String) {
    const u8 = Uint8Array.from(atob(base64String), (c) => c.charCodeAt(0));
    const cs = new DecompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(u8);
    writer.close();
    // Use Response to convert readable stream to arrayBuffer.
    return new TextDecoder().decode(await new Response(cs.readable).arrayBuffer());
  }

  /**
   * Gzips the given string and encodes it as base64
   *
   * @param {String} str
   * @return {Promise<String>}
   */
  static async stringToBase64Gzipped(str) {
    const byteArray = new TextEncoder().encode(str);
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(byteArray);
    writer.close();
    // Use Response to convert readable stream to arrayBuffer.
    const u8 = new Uint8Array(await (new Response(cs.readable).arrayBuffer()));
    return btoa(String.fromCharCode(...u8));
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
