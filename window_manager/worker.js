import {filterWithDisplay, matchActionsToDisplay, Action, ActionWithDisplay} from './classes/action.js';
import {Display, Displays} from './classes/displays.js';
import {filterWithAction, matchMatcherToAction, MatcherWithAction} from './classes/matcher.js';
import {Storage} from './classes/storage.js';
import {checkNonEmpty} from './utils/preconditions.js';
import {combine2, promiseTimeout} from './utils/promise.js';

const UPDATE_TIMEOUT_MS = 5;

const storage = new Storage();

/**
 * @typedef {import('./classes/action.js').WindowsUpdate} WindowsUpdate
 */

/**
 *
 * @param {Promise<Display[]>} displaysPromise
 * @return {Promise<ActionWithDisplay[]>}
 */
function getValidActions(displaysPromise) {
  const actionsPromise = storage.getActions();
  return combine2(actionsPromise, displaysPromise, matchActionsToDisplay)
      .then(filterWithDisplay);
}

/**
 * Returns list of matchers that are valid for the provided actions.
 *
 * @param {Promise<Action[]>} actionsPromise
 * @return {Promise<MatcherWithAction[]>}
 */
function getValidMatchers(actionsPromise) {
  const matchersPromise = storage.getMatchers();
  return combine2(matchersPromise, actionsPromise, matchMatcherToAction)
      .then(filterWithAction);
}

/**
 * Applies actions that matches predicate to the specified windowId.
 *
 * @param {number|undefined} windowId
 * @param {function(Action): boolean} actionPredicateFn
 * @return {Promise<void>}
 */
export function updateWindowWithSpecifiedAction(windowId, actionPredicateFn) {
  if (windowId === undefined) {
    return Promise.reject(new Error('WindowId is undefined.'));
  }

  return getValidActions(Displays.getDisplays())
  // Get all actions that are matching the predicate and select the last one.
      .then(
          (actions) =>
            actions.findLast(actionPredicateFn))
      .then((action) => checkNonEmpty(action, `Could not find action for window: ${windowId}`))
      .then((action) => action.prepareUpdate())
      .then((windowUpdate) => checkNonEmpty(windowUpdate, `Could not find windowUpdate for window: ${windowId}`))
      .then((windowUpdate) => chrome.windows.update(windowId, windowUpdate))
      .then(() => undefined);
}

/**
 * Applies all matched actions to the specified windowId
 *
 * @param {number|undefined} windowId
 * @return {Promise<void>}
 */
export function updateWindowWithAllActions(windowId) {
  if (windowId === undefined) {
    return Promise.reject(new Error('WindowId is undefined.'));
  }

  return chrome.windows.get(windowId, {populate: true})
      .then((window) => checkNonEmpty(window, `Could not find window of id: ${windowId}`))
      .then((window) => updateWindowsWithMatchedActions([window]));
}

/** @return {Promise<void>} */
export function updateAllWindowsWithAllActions() {
  return chrome.windows.getAll({populate: true})
      .then((windows) => updateWindowsWithMatchedActions(windows));
}

/**
 * @typedef {Object} WindowsUpdateWithId
 * @property {number} windowId
 * @property {WindowsUpdate} update
 *
 * Prepares list of updates.
 *
 * @param {MatcherWithAction[]} matchers
 * @param {chrome.windows.Window[]} windows
 * @return {WindowsUpdateWithId[]}
 */
function prepareUpdates(matchers, windows) {
  /** @type {WindowsUpdateWithId[]} */
  const result = [];
  const remainingWindows = new Set(windows);

  // Iterate matchers backwards as the last matched action should be applied
  for (let i = matchers.length -1; i >=0; i--) {
    const matcher = matchers[i];
    for (const window of remainingWindows) {
      if (matcher.matches(window)) {
        remainingWindows.delete(window);
        if (window.id) {
          result.push({windowId: window.id, update: matcher.matchedAction.prepareUpdate()});
        } else {
          console.error(`Matched to '${matcher.matchedAction.id}' but window.id undefined: `, window);
        }
      }
    }
  }
  console.log(`Matched ${result.length} window(s), unmatched: ${remainingWindows.size} (${[...remainingWindows].map((w) => w.id)})`);
  return result.reverse();
}

/**
 * Updates all windows specified in the parameter according to the matching saved actions.
 *
 * @param {chrome.windows.Window[]} windows
 * @return {Promise<void>}
 */
function updateWindowsWithMatchedActions(windows) {
  console.groupCollapsed(`${new Date().toLocaleTimeString()} updateWindowsWithMatchedActions`);

  const actionsPromise = getValidActions(Displays.getDisplays());

  let timeout = 0;
  return getValidMatchers(actionsPromise)
      .then((matchers) => prepareUpdates(matchers, windows))
      .then((updates) => Promise.all(
          updates.map((u) =>
            promiseTimeout(timeout++ * UPDATE_TIMEOUT_MS, u).then((u) => chrome.windows.update(u.windowId, u.update)))))
      .then(() => console.groupEnd())
      .then(() => undefined);
}

