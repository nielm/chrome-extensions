import {Action} from './classes/action.js';
import {Displays} from './classes/displays.js';
import {Settings} from './classes/settings.js';
import {updateWindowWithActions, updateWindowWithMatchedActions, updateWindows} from './worker.js';

let displayChangedTimeoutId = null;

// Initialize session storage
(async () => {
  await Displays.init();
})();

chrome.commands.onCommand.addListener(async (command, tab) => {
  const commandIdPrefix = "zzz-shortcut-";

  if (command === "all-windows-shortcut") {
    updateWindows();
  } else if (command === "focused-window-shortcut") {
    if (tab) {
      updateWindowWithMatchedActions(tab.windowId);
    } else {
      console.log("focused-window-shortcut triggered but tab is not defined.");
    }
  } else if (command.startsWith(commandIdPrefix)) {
    const shortcutId = parseInt(command.slice(commandIdPrefix.length));
    if (isNaN(shortcutId)) {
      throw new Error(`Invalid command: ${command} - expected ${commandIdPrefix}##`);
    }
    console.log(`Shortcut: ${shortcutId}`);
    const actionsPromise = (await Action.loadAll()).filter((action) => action.shortcutId == shortcutId);
    updateWindowWithActions(await actionsPromise);
  } else {
    console.log(`Invalid command: ${command}`);
  }
});

chrome.system.display.onDisplayChanged.addListener(async () => {
  const settings = await Settings.load();
  if (settings.triggerOnMonitorChange) {
    if (displayChangedTimeoutId) {
      clearTimeout(displayChangedTimeoutId);
      console.log(`${new Date().toLocaleTimeString()} onDisplayChanged: setting timer (previous timer cancelled)`);
    } else {
      console.log(`${new Date().toLocaleTimeString()} onDisplayChanged: setting timer`);
    }
    // wait a moment before doing anything - when display is created onDisplayChanged is triggered multiple times, this will consider the last change only.
    displayChangedTimeoutId = setTimeout(
        async () => {
          displayChangedTimeoutId = null;
          if (await Displays.displaysChanged()) {
            console.log(`${new Date().toLocaleTimeString()} onDisplayChanged: display change detected, updating`);
            updateWindows();
          } else {
            console.log(`${new Date().toLocaleTimeString()} onDisplayChanged: displays change not detected`);
          }
        },
        200,
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
