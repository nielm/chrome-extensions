import {Action} from './classes/action.js';
import {Settings} from './classes/settings.js';
import {updateWindowWithActions, updateWindowWithMatchedActions, updateWindows} from './worker.js';

let idleStateActive = true;
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
      bounds: display.bounds,
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
  console.log('onDisplayChanged triggered');
  if (settings.triggerOnMonitorChange) {
    if (displayChangedTimeoutId) {
      console.log('Active timer found - cancelled');
      clearTimeout(displayChangedTimeoutId);
    }
    // wait a moment before doing anything - when display is created onDisplayChanged is triggered multiple times, this will consider the last change only.
    displayChangedTimeoutId = setTimeout(
        async () => {
          displayChangedTimeoutId = null;
          // This event is triggered also on unlock, let's check if anything was really changed.
          const displays = await displaysAsString();
          if (!idleStateActive) {
            console.log('Chromebook is not active - ignoring display update event');
          } else if (currentDisplays != displays) {
            console.log('Displays changed - updating windows.');
            currentDisplays = displays;
            updateWindows();
          } else {
            console.log('Displays not changed');
          }
        },
        // onStateChanged is triggered much later than onDisplayChanged
        // According to my tests sometime between 300 and 500ms. Let's
        // set timeout of 750ms to make sure that we don't update displays
        // on locked screen - shelf is not visible so the work area is changed
        // and then changed back when unlocked, which triggeres unnecessary
        // action.
        750,
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

chrome.idle.onStateChanged.addListener((newIdleState) => {
  console.log(`IdleState: ${newIdleState}`);
  idleStateActive = (newIdleState === 'active');
});
