import {ActionWithDisplay} from './action.js';
import {checkNonEmpty} from '../utils/preconditions.js';

/**
 * @typedef {Object} WindowPositionConfiguration
 * @property {string} actionId
 * @property {number} windowId
 */

/** Session class */
export class Session {
  /**
   * @param {string} actionId
   * @param {number} windowId
   * @return {Promise<void>}
   */
  static rememberWindowPosition(actionId, windowId) {
    return Session.#getWindowPositionConfigurations()
        .then((configs) => configs.filter((c) => c.windowId !== windowId))
        .then((configs) => Session.#setWindowPositionConfigurations([...configs, {actionId, windowId}]));
  }

  /**
   * @param {number} windowId
   * @return {Promise<void>}
   */
  static clearWindowPosition(windowId) {
    return Session.#getWindowPositionConfigurations()
        .then((configs) => configs.filter((c) => c.windowId !== windowId))
        .then((configs) => Session.#setWindowPositionConfigurations([...configs]));
  }

  /**
   * Will check saved windows and return actions.
   *
   * @param {ActionWithDisplay[]} actions
   * @return {Promise<Map<number, ActionWithDisplay>>}
   */
  static mapWindowsToSavedActions(actions) {
    const actionsMap = new Map(actions.map((a) => [a.id, a]));
    return Session.#getWindowPositionConfigurations()
        .then((configs) => new Map(
            configs.filter((c) => actionsMap.has(c.actionId))
                .map((c) => [c.windowId, checkNonEmpty(actionsMap.get(c.actionId), 'This is bug in session.js.')])));
  }

  /**
   * @return {Promise<WindowPositionConfiguration[]>}
   */
  static #getWindowPositionConfigurations() {
    return chrome.storage.session.get({windowPositionConfigurations: '[]'})
        .then((item) => JSON.parse(item.windowPositionConfigurations));
  }

  /**
   * @param {WindowPositionConfiguration[]} windowPositionConfigurations
   * @return {Promise<void>}
   */
  static #setWindowPositionConfigurations(windowPositionConfigurations) {
    return chrome.storage.session.set({windowPositionConfigurations: JSON.stringify(windowPositionConfigurations)});
  }
}
