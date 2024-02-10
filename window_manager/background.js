import {Displays} from './classes/displays.js';
import {Storage} from './classes/storage.js';
import {updateWindowWithAllActions, updateAllWindowsWithAllActions, updateWindowWithSpecifiedAction} from './worker.js';

const ACTION_START_TIMEOUT_MS = 200;

let displayChangedTimeoutId = null;

// Initialize session storage
(async () => {
  await Displays.init();
})();

const storage = new Storage();

chrome.commands.onCommand.addListener(async (command, tab) => {
  const commandIdPrefix = 'zzz-shortcut-';

  if (command === 'all-windows-shortcut') {
    await updateAllWindowsWithAllActions();
  } else if (command === 'focused-window-shortcut') {
    await updateWindowWithAllActions(tab?.windowId);
  } else if (command.startsWith(commandIdPrefix)) {
    const shortcutId = parseInt(command.slice(commandIdPrefix.length), 10);
    await updateWindowWithSpecifiedAction(tab?.windowId, ((a) => a.shortcutId === shortcutId));
  } else {
    console.log(`Invalid command: ${command}`);
  }
});

chrome.system.display.onDisplayChanged.addListener(async () => {
  const settings = await storage.getSettings();
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
            await updateAllWindowsWithAllActions();
          } else {
            console.log(`${new Date().toLocaleTimeString()} onDisplayChanged: displays change not detected`);
          }
        },
        ACTION_START_TIMEOUT_MS,
    );
  }
});

chrome.windows.onCreated.addListener(async (window) => {
  const settings = await storage.getSettings();
  if (settings.triggerOnWindowCreated) {
    setTimeout(updateWindowWithAllActions, ACTION_START_TIMEOUT_MS, window.id);
  }
});

// This is triggered from the options menu.
chrome.runtime.onMessage.addListener(
    async function(request, sender, sendResponse) {
      if (request.command === 'updateAllWindowsWithAllActions') {
        await updateAllWindowsWithAllActions();
        return true;
      } else if (request.command === 'updateWindowWithSpecifiedAction') {
        if (request.actionId && request.windowId) {
          await updateWindowWithSpecifiedAction(request.windowId, ((a) => a.id === request.actionId));
          return true;
        }
        console.warn(`Invalid updateWindowWithSpecifiedAction: ${request}`);
      }

      return false;
    },
);
