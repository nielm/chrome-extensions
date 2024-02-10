import {ActionWithDisplay} from './action.js';
import {checkNonEmpty} from '../utils/preconditions.js';
import {validateClass} from '../utils/validation.js';

/**
 * Will convert Matcher to MatcherWithAction based on the actions list.
 * The output list will have the same size as an input list, if the action
 * is not found the same Matcher will be returned.
 *
 * Note: actions array should contain valid actions only as the method will
 * assign these actions to matchers.
 *
 * @param {Matcher[]} matchers
 * @param {ActionWithDisplay[]} actions
 * @return {(MatcherWithAction | Matcher)[]}
 */
export function matchMatcherToAction(matchers, actions) {
  /** @type {Map<string, ActionWithDisplay>} */
  const actionIdToAction = new Map();
  // Let's iterate backwards to create mapping of actionId => action considering the last actionId.
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    if (!actionIdToAction.has(action.id)) {
      actionIdToAction.set(action.id, action);
    }
  }

  return matchers.map((matcher) => {
    // Find the last existing actionId or undefined.
    const actionId = matcher.actions.findLast((mAction) => actionIdToAction.has(mAction));
    return actionId ?
            new MatcherWithAction(checkNonEmpty(actionIdToAction.get(actionId), 'This is bug in the matcher.js code.'), matcher) : matcher;
  });
}

/**
 * @param {(MatcherWithAction | Matcher)[]} matchers
 * @return {MatcherWithAction[]}
 */
export function filterWithAction(matchers) {
  return matchers
      .map((m) => (m instanceof MatcherWithAction ? m : undefined))
      .filter((m) => m)
      .map((m) => checkNonEmpty(m, 'This is bug in the matcher.js code: filter.'));
}


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
   * Creates object from json string without validation.
   *
   * @param {*} json
   * @return {Matcher}
   */
  static from(json) {
    return Object.assign(new Matcher(), json);
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
    console.log(`${this.toString()} matched: `, window);
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


/** ActionWithDisplay class */
export class MatcherWithAction extends Matcher {
  /** @type {ActionWithDisplay} */
  matchedAction;

  /**
   * @param {ActionWithDisplay} matchedAction
   * @param {Matcher} matcher
   */
  constructor(matchedAction, matcher) {
    super();
    Object.assign(this, matcher);
    this.matchedAction = matchedAction;
  }
}
