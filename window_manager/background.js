import {Action} from './classes/action.js';
import {Settings} from './classes/settings.js';
import {updateWindowWithActions, updateWindowWithMatchedActions, updateWindows} from './worker.js';

let displayChangedTimeoutId = null;

let currentDisplays = '';
(async () => {
  currentDisplays = await displaysAsString();
})();

async function displaysAsString() {
  const displays = await chrome.system.display.getInfo({});
  return JSON.stringify(displays.map((display) => (
    {
      // return all the properties that we use to arrange windows
      id: display.id,
      name: display.name,
      isPrimary: display.isPrimary,
      isInternal: display.isInternal,
      workArea: display.workArea,
    })));
}

chrome.commands.onCommand.addListener(async (command) => {
  const shortcutId = parseInt(command.charAt(command.length - 1));
  if (shortcutId < 0 || shortcutId > 9) {
    throw new Error(`Invalid command: ${command} - expected id between 0 and 9.`);
  }

  if (shortcutId == 0) {
    updateWindows();
  } else {
    const actionsPromise = (await Action.loadAll()).filter((action) => action.shortcutId == shortcutId);
    updateWindowWithActions(await actionsPromise);
  }
});

chrome.system.display.onDisplayChanged.addListener(async () => {
  const settings = await Settings.load();
  if (settings.triggerOnMonitorChange) {
    if (displayChangedTimeoutId) {
      console.log(`${new Date().toLocaleTimeString()} onDisplayChanged: active timer found - cancelled`);
      clearTimeout(displayChangedTimeoutId);
    }
    // wait a moment before doing anything - when display is created onDisplayChanged is triggered multiple times, this will consider the last change only.
    displayChangedTimeoutId = setTimeout(
        async () => {
          displayChangedTimeoutId = null;
          // This event is triggered also on unlock, let's check if anything was really changed.
          const idleStatePromise = chrome.idle.queryState(15);
          const displays = await displaysAsString();
          if ((await idleStatePromise) == 'locked') {
            console.log(`${new Date().toLocaleTimeString()} onDisplayChanged: not updating - locked`);
          } else if (currentDisplays != displays) {
            console.groupCollapsed(`${new Date().toLocaleTimeString()} onDisplayChanged: updating windows.`);
            console.log(`Old displays: ${currentDisplays}`);
            console.log(`New displays: ${displays}`);
            console.groupEnd();
            currentDisplays = displays;
            updateWindows();
          } else {
            console.log(`${new Date().toLocaleTimeString()} onDisplayChanged: not updating - displays not changed`);
          }
        },
        300,
    );
  }
});

chrome.windows.onCreated.addListener(async (window) => {
  const settings = await Settings.load();
  if (settings.triggerOnWindowCreated) {
    updateWindowWithMatchedActions(window.id);
  }
});

// This is triggered from the options menu.
chrome.runtime.onMessage.addListener(
    async function(request, sender, sendResponse) {
      if (request.command === 'updateWindows') {
        if (request.actionId) {
        // If request contains actionId it is applied to the current window only
          const actionsPromise = (await Action.loadAll()).filter((action) => action.id == request.actionId);
          updateWindowWithActions(await actionsPromise);
        } else {
          updateWindows();
        }
        return true;
      }
      return false;
    },
);
