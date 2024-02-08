import {Action} from './classes/action.js';
import {Displays} from './classes/displays.js';
import {Settings} from './classes/settings.js';
import {checkNonUndefined} from './utils/preconditions.js';

/** @return {void} */
function organiseClick() {
  chrome.runtime.sendMessage({command: 'updateWindows', actionId: null});
}

/** @return {Promise<void>} */
async function createActionsMenu() {
  // Only create buttons for actions which have valid displays.
  const settingsPromise = Settings.load();
  const actionsPromise = Action.loadAll();
  const displays = await Displays.getDisplays();

  const actions = (await actionsPromise)
      .filter((action) => action.menuName)
      .filter((action) => action.findDisplay(displays)!=null);

  const actionsEl = checkNonUndefined(document.getElementById('actions'));
  for (const action of actions) {
    const actionEl = document.createElement('button');
    actionEl.textContent = action.menuName;
    actionEl.addEventListener('click', () => chrome.runtime.sendMessage({command: 'updateWindows', actionId: action.id}));
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
