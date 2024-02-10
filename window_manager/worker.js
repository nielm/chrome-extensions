import {Action, ActionWithDisplay} from './classes/action.js';
import {Display, Displays} from './classes/displays.js';
import {Storage} from './classes/storage.js';
import {checkNonEmpty} from './utils/preconditions.js';
import {combine2} from './utils/promise.js';

const UPDATE_TIMEOUT_MS = 5;

const storage = new Storage();

/**
 * Returns list of actions that are valid for current display.
 *
 * @param {Promise<Display[]>} displaysPromise
 * @return {Promise<ActionWithDisplay[]>}
 */
function getValidActions(displaysPromise) {
  const actionsPromise = storage.getActions();
  const referencedDisplayIdsPromise = actionsPromise.then((actions) => new Set(actions.map((a) => a.display)));
  const displaysMapPromise = combine2(displaysPromise, referencedDisplayIdsPromise, Displays.mapDisplays);

  return combine2(actionsPromise, displaysMapPromise, (actions, displaysMap) =>
    actions.filter((a) => displaysMap.get(a.display)).map((a) => new ActionWithDisplay(checkNonEmpty(displaysMap.get(a.display), 'This is a bug in the code - empty entries should be filtered.'), a)));
}

/**
 * Applies actions that matches predicate to the specified windowId.
 *
 * @param {number} windowId
 * @param {function(Action): boolean} actionPredicateFn
 * @return {Promise<void>}
 */
export function updateWindowWithSpecifiedAction(windowId, actionPredicateFn) {
  return getValidActions(Displays.getDisplays())
  // Get all actions that are matching the predicate and select the last one.
      .then(
          (actions) =>
            actions.filter(actionPredicateFn).findLast(() => true))
      .then((action) => checkNonEmpty(action, `Could not find action for window: ${windowId}`))
      .then((action) => action.prepareUpdate())
      .then((actionUpdate) => chrome.windows.update(windowId, actionUpdate))
      .then(() => undefined);
}

/**
 * Applies all matched actions to the specified windowId
 *
 * @param {number} windowId
 * @return {Promise<void>}
 */
export function updateWindowWithAllActions(windowId) {
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
 * Updates all windows specified in the parameter according to the matching saved actions.
 *
 * @param {chrome.windows.Window[]} windows
 * @return {Promise<void>}
 */
async function updateWindowsWithMatchedActions(windows) {
  const displaysPromise = Displays.getDisplays();
  const actionsPromise = storage.getActions();
  const matchersPromise = storage.getMatchers();

  const displays = await displaysPromise;

  console.groupCollapsed(`${new Date().toLocaleTimeString()} updateWindowsWithMatchedActions`);

  const actions = new Map(
      (await actionsPromise)
          .map((a) => [a.id, a.createUpdate(displays)]));
  // Workaround for the TS compiler - cannot filter null values directly in array: TS2769
  actions.forEach((value, key) => {
    if (value === null) {
      actions.delete(key);
    }
  });
  console.log('Got valid actions for current displays: ', [...actions.keys()]);

  let matchers = await matchersPromise;

  // Filter out invalid/unknown actions from each matcher
  for (const matcher of matchers) {
    matcher.actions = matcher.actions.filter((a) => actions.has(a));
  }
  // Filter out matchers with no (remaining) valid actions
  matchers = matchers.filter((m) => m.actions.length > 0);
  console.log('Got valid matchers for current displays: ', matchers);

  // orderArray[i] will contain all window ids matched by matcher number i
  /** @type {Array<Array<number>>} */
  const orderArray = matchers.map(() => []);
  // actionMap will contain action (windowUpdate object) and use window id as key.
  const windowUpdateMap = new Map();

  let timeout = 0;
  for (const window of windows) {
    const windowUpdate = {};
    for (let i = 0; i < matchers.length; i++) {
      if (matchers[i].matches(window)) {
        for (const actionName of matchers[i].actions) {
          // we only have valid actions in the action list.
          console.log(`Matched ${actionName} to window:`, (window.tabs?.at(0)?.url || window.tabs?.at(0)?.pendingUrl), window.tabs);

          if (window.id !== undefined) {
            orderArray[i].push(window.id);
            // merge window updates from this action with existing window updates.
            Object.assign(windowUpdate, actions.get(actionName));
          } else {
            console.error('Windows id is undefined');
          }
        }
      }
    }

    // If something to apply, apply it!
    if (Object.keys(windowUpdate).length > 0 ) {
      console.log('Will update window with', windowUpdate);
      windowUpdateMap.set(window.id, windowUpdate);
    }
  }

  // Set is keeping order of the first insertion. When order is reversed
  // it will keep the order of the last insertion (we want to update windows in an order
  // of matchers).
  for (const windowId of Array.from(new Set(orderArray.flat().reverse())).reverse()) {
    if (!windowUpdateMap.has(windowId)) {
      // windowIds are added in the same if clause - all of them should be in the map.
      throw Error(`Action undefined, id: ${windowId}. This is bug in the code.`);
    }
    setTimeout(chrome.windows.update,
        timeout++ * UPDATE_TIMEOUT_MS,
        windowId,
        windowUpdateMap.get(windowId));
    windowUpdateMap.delete(windowId);
  }

  if (windowUpdateMap.size != 0) {
    // windowIds are added in the same if clause - all of them should be in the map.
    throw Error(`Map size expected to be 0 after updates, actual: ${windowUpdateMap.size}. This is bug in the code.`);
  }

  // Finalize logging after all windows are updated.
  setTimeout(console.groupEnd, timeout * UPDATE_TIMEOUT_MS);
}

