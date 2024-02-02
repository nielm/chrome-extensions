import {Settings} from './settings.js';

// Default values will match all the windows
export class Matcher {
  windowTypes;
  anyTabUrl;
  minTabsNum = 0;
  maxTabsNum = 1_000_000_000;
  actions;

  static loadAll() {
    return chrome.storage.sync.get({matchers: '[]'})
        .then((items) => items.matchers)
        .then((matchers) => (matchers ?
                        JSON.parse(matchers).map((a) => Matcher.from(a)) :
                        []));
  }

  static from(json) {
    if (!json.actions) {
      console.error(json);
      throw new Error('action for matcher not defined');
    }
    return Object.assign(new Matcher(), json);
  }

  static validate(json) {
    try {
      Settings.validateClass(new Matcher(), json, ['windowTypes', 'anyTabUrl', 'minTabsNum', 'maxTabsNum', 'comment']);
    } catch (e) {
      throw new Error(`Invalid matcher with actions=[${json.actions}]: ${e.message}`);
    }
  }

  matches(window) {
    if (this.windowTypes?.length > 0 && !this.windowTypes?.includes(window.type)) {
      // console.log('Not matched: windowsType');
      return false;
    }
    if (this.anyTabUrl &&
        !window.tabs.some((tab) => ((tab.url || tab.pendingUrl).toLowerCase().includes(this.anyTabUrl.toLowerCase())))) {
      // console.log('Not matched: anyTabUrl');
      return false;
    }
    if (window.tabs.length < this.minTabsNum) {
      // console.log('Not matched: minTabsNum');
      return false;
    }
    if (window.tabs.length > this.maxTabsNum) {
      // console.log('Not matched: maxTabsNum');
      return false;
    }
    // console.log('Matched');
    return true;
  }

  toString() {
    return [
      this.windowTypes ? `[${this.windowTypes}]` : null,
      this.anyTabUrl ? `${this.anyTabUrl}` : null,
      this.minTabsNum ? `>=${this.minTabsNum}` : null,
      this.maxTabsNum !== 1_000_000_000 ? `<=${this.maxTabsNum}` : null,
    ].filter(Boolean).join(', ') || 'CATCH ALL';
  }
}
