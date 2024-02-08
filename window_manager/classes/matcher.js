import {Settings} from './settings.js';

/**
 * Matcher class.
 * Default values will match all the windows.
 */
export class Matcher {
  /** @type {string[]} */
  windowTypes;

  /** @type {string} */
  anyTabUrl;

  /** @type {number} */
  minTabsNum = 0;

  /** @type {number} */
  maxTabsNum = 1_000_000_000;

  /** @type {string[]} */
  actions;

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
  * @param {*} json
  * @return {Matcher}
  */
  static from(json) {
    if (!json.actions) {
      console.error(json);
      throw new Error('action for matcher not defined');
    }
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
    if ((window.tabs?.length || 0) < this.minTabsNum) {
      // console.log('Not matched: minTabsNum');
      return false;
    }
    if ((window.tabs?.length || 0) > this.maxTabsNum) {
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
      this.maxTabsNum !== 1_000_000_000 ? `<=${this.maxTabsNum}` : null,
    ].filter(Boolean).join(', ') || 'CATCH ALL';
  }
}
