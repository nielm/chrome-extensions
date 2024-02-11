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

/** @return {Promise<void>} */
async function createActionsMenu() {
  const storage = new Storage();
  const settingsPromise = storage.getSettings();

  // Only create buttons for actions which have valid displays.
  const actionsWithDisplay = await combine2(storage.getActions(), Displays.getDisplays(), matchActionsToDisplay)
      .then((actions) => filterWithDisplay(actions));

  // Find all action menu names
  const actionMenuNames = new Set(actionsWithDisplay.filter((a) => a.menuName).map((a) => a.menuName));

  const currentWindowId = (await chrome.windows.getCurrent()).id;

  const actionsEl = checkNonUndefined(document.getElementById('actions'));
  for (const actionMenuName of actionMenuNames) {
    const actionEl = document.createElement('button');
    actionEl.textContent = actionMenuName;
    actionEl.addEventListener('click', () => chrome.runtime.sendMessage(
        {command: 'updateWindowWithSpecifiedMenuName', menuName: actionMenuName, windowId: currentWindowId}));
    actionsEl.appendChild(actionEl);
  }

  setCss(await settingsPromise);
}

/**
 * @param {Settings} settings
 * @return {Promise<void>}
 */
async function setCss(settings) {
  for (const element of document.querySelectorAll('button')) {
    element.style.backgroundColor = settings.popupButtonColor;
  }
  document.body.style.backgroundColor = settings.popupBackgroundColor;
}

document.addEventListener('DOMContentLoaded', createActionsMenu);
checkNonUndefined(document.getElementById('organise')).addEventListener('click', organiseClick);
