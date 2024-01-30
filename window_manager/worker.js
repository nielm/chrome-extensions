import {Action} from './classes/action.js';
import {Displays} from './classes/displays.js';
import {Matcher} from './classes/matcher.js';

const UPDATE_TIMEOUT_MS = 5;

// Applies specified actions to the focused window
export async function updateWindowWithActions(actions) {
  const windowPromise = chrome.windows.getLastFocused();
  const displayPromise = Displays.getDisplays();

  const windowUpdate = {};
  // merge actions - createUpdate only returns values for actions with valid displays.
  for (const action of actions) {
    Object.assign(windowUpdate, action.createUpdate(await displayPromise));
  }
  if (Object.keys(windowUpdate).length > 0 ) {
    chrome.windows.update((await windowPromise).id, windowUpdate);
  }
}

// Applies all matched actions to the specified windowId
export async function updateWindowWithMatchedActions(windowId) {
  updateWindowsFromArray((await chrome.windows.getAll({populate: true})).filter((window) => window.id === windowId));
}

export async function updateWindows() {
  updateWindowsFromArray(await chrome.windows.getAll({populate: true}));
}

async function updateWindowsFromArray(windows) {
  const displaysPromise = Displays.getDisplays();
  const actionsPromise = Action.loadAll();
  const matchersPromise = Matcher.loadAll();

  const displays = await displaysPromise;

  console.groupCollapsed(`${new Date().toLocaleTimeString()} updateWindowsFromArray`);

  // create a map of action name -> windowUpdate object for only actions valid for the current set of displays:
  const actions = new Map(
      (await actionsPromise)
          .map((a) => [a.id, a.createUpdate(displays)])
      // createUpdate returns null when no matching display.
          .filter((pair) => pair[1] != null ));
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
          console.log(`Matched ${actionName} to window:`, (window.tabs[0]?.url || window.tabs[0]?.pendingUrl), window.tabs);

          orderArray[i].push(window.id);
          // merge window updates from tbis action with existing window updates.
          Object.assign(windowUpdate, actions.get(actionName));
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
      throw Error(`Action undefined, id: ${windowsId}. This is bug in the code.`);
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


