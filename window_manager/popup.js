import {filterWithDisplay, matchActionsToDisplay} from './classes/action.js';
import {Displays} from './classes/displays.js';
import {Settings} from './classes/settings.js';
import {Storage} from './classes/storage.js';
import {checkNonUndefined} from './utils/preconditions.js';
import {combine2} from './utils/promise.js';

/** @return {void} */
function organiseClick() {
  chrome.runtime.sendMessage({command: 'updateAllWindowsWithAllActions'});
}

/**
 * @param {Set<string>} actionMenuNames
 * @param {number|undefined} windowId
 */
function addActions(actionMenuNames, windowId) {
  const actionsEl = checkNonUndefined(document.getElementById('actions'));
  for (const actionMenuName of actionMenuNames) {
    const actionEl = document.createElement('button');
    actionEl.textContent = actionMenuName;
    actionEl.addEventListener('click', () => chrome.runtime.sendMessage(
        {command: 'updateWindowWithSpecifiedMenuName', menuName: actionMenuName, windowId: windowId}));
    actionsEl.appendChild(actionEl);
  }
}

/**
 * @param {Settings} settings
 */
function setCss(settings) {
  const style = document.createElement('style');
  style.innerHTML = `
    button {
      background-color: ${settings.popupButtonColor};
    }
    body {
      background-color: ${settings.popupBackgroundColor};
    }`;
  document.head.appendChild(style);
}

/** @return {Promise<void>} */
function createActionsMenu() {
  const storage = new Storage();
  const actionsWithMenuPromise = storage.getActions()
      .then((actions) => actions.filter((a) => a.menuName));

  // Only create buttons for actions which have valid displays.
  const actionMenuNamesPromise = combine2(actionsWithMenuPromise, Displays.getDisplays(), matchActionsToDisplay)
      .then((actions) => filterWithDisplay(actions).map((a) => a.menuName))
      .then((actions) => new Set(actions));

  /** @type {Promise<void>} */
  const menuGeneratedPromise = combine2(actionMenuNamesPromise, chrome.windows.getCurrent().then((window) => window.id), addActions);
  const cssPromise = storage.getSettings().then((s) => setCss(s));

  return combine2(menuGeneratedPromise, cssPromise, () => undefined);
}

document.addEventListener('DOMContentLoaded', createActionsMenu);
checkNonUndefined(document.getElementById('organise')).addEventListener('click', organiseClick);
