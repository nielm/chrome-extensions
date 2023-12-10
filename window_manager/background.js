import {Action} from './classes/action.js';
import {Settings} from './classes/settings.js';
import {updateWindowWithActions, updateWindowWithMatchedActions, updateWindows} from './worker.js';

let currentDisplays = "";
(async () => {
  currentDisplays = await displaysAsString();
})();

async function displaysAsString() {
  return (await chrome.system.display.getInfo({})).map(display => display.id).toString();
}

chrome.commands.onCommand.addListener(async (command) => {
  const shortcutId = parseInt(command.charAt(command.length - 1));
  if (shortcutId < 1 || shortcutId > 9) {
    throw new Error(`Invalid command: ${command} - expected id between 1 and 9.`);
  }

  const actionsPromise = (await Action.loadAll()).filter(action => action.shortcutId == shortcutId);
  updateWindowWithActions(await actionsPromise);
});

chrome.system.display.onDisplayChanged.addListener(async () => {
  const settings = await Settings.load();
  if (settings.triggerOnMonitorChange) {
    // This event is triggered also on unlock, let's check if anything was really changed.
    const displays = await displaysAsString();
    if (currentDisplays != displays) {
      currentDisplays = displays;
      setTimeout(updateWindows, 500);
    }
  }
});

chrome.windows.onCreated.addListener(async (window) => {
  const settings = await Settings.load();
  if (settings.triggerOnWindowCreated) {
    updateWindowWithMatchedActions(window.id);
  }
});

chrome.runtime.onMessage.addListener(
  async function(request, sender, sendResponse) {
    if (request.command === 'updateWindows') {
      if (request.actionId) {
        // If request contains actionId it is applied to the current window only
        const actionsPromise = (await Action.loadAll()).filter(action => action.id == request.actionId);
        updateWindowWithActions(await actionsPromise);
      } else {
        updateWindows();
      }
      return true;
    }
    return false;
  }
);

