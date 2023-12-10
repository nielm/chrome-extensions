import {Action} from './classes/action.js';
import {Settings} from './classes/settings.js';
import {updateWindows} from './worker.js';

function organiseClick() {
  chrome.runtime.sendMessage({command: "updateWindows", actionId: null});
}

async function createActionsMenu() {
  const actions = (await Action.loadAll()).filter(action => action.menuName);
  
  const actionsEl = document.getElementById('actions');
  for (const action of actions) {
    const actionEl = document.createElement('button');
    actionEl.textContent = action.menuName;
    actionEl.addEventListener('click', () => chrome.runtime.sendMessage({command: "updateWindows", actionId: action.id}));
    actionsEl.appendChild(actionEl);
  }

  setCss();
}

async function setCss() {
  const settings = await Settings.load();
  
  for (const element of document.querySelectorAll('button')) {
    element.style.backgroundColor = settings.popupButtonColor;
  }
  document.body.style.backgroundColor = settings.popupBackgroundColor;
}

document.addEventListener('DOMContentLoaded', createActionsMenu);
document.getElementById('organise').addEventListener('click', organiseClick);
