import {Action} from './classes/action.js';
import {Matcher} from './classes/matcher.js'
import {Position} from './classes/position.js';

const UPDATE_TIMEOUT_MS = 5;

// Applies specified actions to the focused window
export async function updateWindowWithActions(actions) {
  const windowPromise = chrome.windows.getLastFocused();
  const displayPromise = chrome.system.display.getInfo({});

  for (const action of actions) {
    chrome.windows.update((await windowPromise).id, action.createUpdate(await displayPromise));
  }
}

// Applies all matched actions to the specified windowId
export async function updateWindowWithMatchedActions(windowId) {
  updateWindowsFromArray((await chrome.windows.getAll({populate : true})).filter(window => window.id === windowId));
}

export async function updateWindows() {
  updateWindowsFromArray(await chrome.windows.getAll({populate : true}));
}

async function updateWindowsFromArray(windows) {
  const displaysPromise = chrome.system.display.getInfo({});
  const actionsPromise = Action.loadAll();
  const matchersPromise = Matcher.loadAll();

  const displays = await displaysPromise;
  const actions = new Map((await actionsPromise)
                          .map(a => [a.id, a.createUpdate(displays)]));
  const matchers = await matchersPromise;

  for (const matcher of matchers) {
    for (const action of matcher.actions) {
      if (!actions.has(action)) {
        throw new Error(`Action: ${action} not defined.`); 
      }
    }
  }

  console.debug(actions);
  // orderArray[i] will contain all window ids matched by matcher number i
  const orderArray = matchers.map(() => []);
  // actionMap will contain action (windowUpdate object) and use window id as key.
  const windowUpdateMap = new Map();

  var timeout = 0;
  for (const window of windows) {
    console.log('Matching', window.tabs[0]?.url, window.tabs);
    const windowUpdate = {};
  
    for (let i = 0; i < matchers.length; i++) {
      if (matchers[i].matches(window)) {
        for (const action of matchers[i].actions) {
          const actionWindowUpdate = actions.get(action);
          if (Object.entries(actionWindowUpdate).length > 0) {
            orderArray[i].push(window.id);
            for (const [key, value] of Object.entries(actionWindowUpdate)) {
              windowUpdate[key] = value;
            }
          }
        }
      }
    }

    // all windows to update are set to be focused so we can check for the existence of this flag.
    if (windowUpdate.focused) {
      console.log('Will update', window.tabs[0]?.url, windowUpdate);
      windowUpdateMap.set(window.id, windowUpdate);
    } else {
      console.log('No match');
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
}






