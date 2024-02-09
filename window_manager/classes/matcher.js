import {Settings} from './settings.js';
import {validateClass} from '../utils/validation.js';

/**
 * Matcher class.
 * Default values will match all the windows.
 */
export class Matcher {
  /** @type {string} */
  comment;

  /** @type {string[]} */
  actions;

  /** @type {string[]} */
  windowTypes;

  /** @type {string} */
  anyTabUrl;

  /** @type {number} */
  minTabsNum;

  /** @type {number} */
  maxTabsNum;

  /** @return {void} */
  validate() {
    validateClass(new Matcher(), this, ['windowTypes', 'anyTabUrl', 'minTabsNum', 'maxTabsNum', 'comment']);
  }

  /**
   * @return {Promise<Matcher[]>}
   */
  static loadAll() {
    return chrome.storage.sync.get({matchers: '[]'})
        .then((items) => items.matchers)
        .then((matchers) => (matchers ?
                        JSON.parse(matchers).map((a) => Matcher.from(a)) :
                        []));
  }

  /**
   * Creates object from json string without validation.
   *
   * @param {*} json
   * @return {Matcher}
   */
  static from(json) {
    return Object.assign(new Matcher(), json);
  }

  /**
  * @param {*} json
  * @return {void}
  */
  static validate(json) {
    try {
      Settings.validateClass(new Matcher(), json, ['windowTypes', 'anyTabUrl', 'minTabsNum', 'maxTabsNum', 'comment']);
    } catch (e) {
      throw new Error(`Invalid matcher with actions=[${json.actions}]: ${e.message}`);
    }
  }

  /**
  * @param {chrome.windows.Window} window
  * @return {boolean}
  */
  matches(window) {
    if (this.windowTypes?.length > 0 && !this.windowTypes?.includes(window.type || '')) {
      // console.log('Not matched: windowsType');
      return false;
    }
    if (this.anyTabUrl &&
        !window.tabs?.some((tab) => ((tab.url || tab.pendingUrl)?.toLowerCase()?.includes(this.anyTabUrl.toLowerCase())))) {
      // console.log('Not matched: anyTabUrl');
      return false;
    }
    if ((window.tabs?.length || 0) < (this.minTabsNum || 0)) {
      // console.log('Not matched: minTabsNum');
      return false;
    }
    if ((window.tabs?.length || 0) > (this.maxTabsNum || 1_000_000_000)) {
      // console.log('Not matched: maxTabsNum');
      return false;
    }
    // console.log('Matched');
    return true;
  }

  /**
  * @return {string}
  */
  toString() {
    return [
      this.windowTypes ? `[${this.windowTypes}]` : null,
      this.anyTabUrl ? `${this.anyTabUrl}` : null,
      this.minTabsNum ? `>=${this.minTabsNum}` : null,
      this.maxTabsNum ? `<=${this.maxTabsNum}` : null,
    ].filter(Boolean).join(', ') || 'CATCH ALL';
  }
}
