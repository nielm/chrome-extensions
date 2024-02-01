import {Action} from './classes/action.js';
import {Displays} from './classes/displays.js';
import {Matcher} from './classes/matcher.js';
import {Settings} from './classes/settings.js';

// As defined here: https://developer.chrome.com/docs/extensions/reference/api/storage
const QUOTA_BYTES_PER_ITEM = 8192;

async function saveOptions() {
  const actions = document.getElementById('actionsInput').value;
  const matchers = document.getElementById('matchersInput').value;
  const settings = document.getElementById('settingsInput').value;

  if (await validateOptions()) {
    chrome.storage.sync.set(
        {
          actions: compress(actions),
          matchers: compress(matchers),
          settings: compress(settings)
        },
        () => {
          setStatus('', '', '', 'Options saved');
        },
    );
  }
}

function compress(value) {
  return JSON.stringify(JSON.parse(value));
}

function format(value) {
  return JSON.stringify(JSON.parse(value), undefined, 2);
}

let maybeValidateActionsTimer = undefined;
function maybeValidateActions() {
  if (maybeValidateActionsTimer) {
    clearTimeout(maybeValidateActionsTimer);
  }
  maybeValidateActionsTimer = setTimeout(validateActions, 100, false);
}

let maybeValidateMatchersTimer = undefined;
function maybeValidateMatchers() {
  if (maybeValidateMatchersTimer) {
    clearTimeout(maybeValidateMatchersTimer);
  }
  maybeValidateMatchersTimer = setTimeout(validateMatchers, 100, false);
}

let maybeValidateSettingsTimer = undefined;
function maybeValidateSettings() {
  if (maybeValidateSettingsTimer) {
    clearTimeout(maybeValidateSettingsTimer);
  }
  maybeValidateSettingsTimer = setTimeout(validateSettings, 100, false);
}

function validateActions() {
  return validateField('actions', Action.validate);
}

function validateMatchers() {
  return validateField('matchers', Matcher.validate);
}

function validateSettings() {
  return validateField('settings', Settings.validate);
}

function validateField(element, validateFn) {
  let json;
  const statusEl = document.getElementById(element + 'InputStatus');
  statusEl.textContent = '';
  statusEl.removeAttribute('class');

  try {
    json = compress(document.getElementById(element + 'Input').value);
    const size = new TextEncoder().encode(JSON.stringify({[element]: json})).length;
    document.getElementById(element + 'Counter').textContent = `${size}/${QUOTA_BYTES_PER_ITEM}`;
    if (size > QUOTA_BYTES_PER_ITEM) {
      throw new Error(`Configuration size ${size}b is greater than allowed: ${QUOTA_BYTES_PER_ITEM}b`);
    }
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.classList.add('warning');
    return false;
  }

  const jsonObj = JSON.parse(json);
  try {
    for (let o of (Array.isArray(jsonObj) ? jsonObj : [jsonObj])) {
      validateFn(o);
    }
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.classList.add('warning');
    return false;
  }

  return true;
}

async function validateOptions() {
  // Use single "&" to make sure that all methods are called
  if (!(validateActions() & validateMatchers() & validateSettings())) {
    setStatus('Invalid JSON configuration');
    return false;
  }

  const actionsObj = JSON.parse(document.getElementById('actionsInput').value);
  const matchersObj = JSON.parse(document.getElementById('matchersInput').value);

  const matchersWithInvalidActionsMap = findMatchersWithInvalidActions(actionsObj, matchersObj);

  // At this point JSONs are valid and we can show parsed actions
  await showActions(actionsObj, matchersObj, matchersWithInvalidActionsMap);
  

  if (matchersWithInvalidActionsMap.size > 0) {
    const statusEl = document.getElementById('matchersInputStatus');
    statusEl.classList.add('warning');
    statusEl.textContent = `Matchers refer to unknown Action ids: ${Array.from(matchersWithInvalidActionsMap.keys())}. See "Parsed actions" section for details.`;

    setStatus('Incorrect configuration - see above.');
    return false;
  } else {
    return true;
  }
}

/**
 * Verify that all Matchers reference a valid Action
 * @param {*} actionsObj
 * @param {*} matchersObj
 * @return {boolean} if validated successfully
 */
function findMatchersWithInvalidActions(actionsObj, matchersObj) {
  const validActionIds = new Set(actionsObj.map((a) => a.id));
  const referencedActionIds = new Set(matchersObj.map((m)=> m.actions).flat());

  const result = new Map();
  for (const referencedActionId of referencedActionIds) {
    if (!validActionIds.has(referencedActionId)) {
      result.set(referencedActionId, matchersObj.filter(matcher => (matcher.actions.includes(referencedActionId))));
    }
  }

  return result;
}


function formatOptions() {
  const actions = document.getElementById('actionsInput').value;
  const matchers = document.getElementById('matchersInput').value;
  const settings = document.getElementById('settingsInput').value;

  if (validateOptions()) {
    document.getElementById('actionsInput').value = format(actions);
    document.getElementById('matchersInput').value = format(matchers);
    document.getElementById('settingsInput').value = format(settings);
  }
}

// Restores the preferences from chrome.storage.
function restoreOptions() {
  chrome.storage.sync.get(
      {actions: '', matchers: '', settings: ''},
      (items) => {
        document.getElementById('actionsInput').value = format(items.actions);
        document.getElementById('matchersInput').value = format(items.matchers);
        document.getElementById('settingsInput').value = format(items.settings);
        validateOptions();
      },
  );
}

async function showDisplays() {
  const displays = await Displays.getDisplays();

  // Sort displays by position on desktop -> left to right, then top to bottom
  displays.sort((d1, d2) => d1.bounds.top - d2.bounds.top);
  displays.sort((d1, d2) => d1.bounds.left - d2.bounds.left);

  const displayTable = document.getElementById('displays');
  const displayRowTemplate = document.getElementById('displayRow');
  displayTable.replaceChildren();
  for (const display of displays) {
    const displayRow = displayRowTemplate.cloneNode(true);
    const cols = [...displayRow.getElementsByTagName('td')];

    cols[0].replaceChildren(document.createTextNode(display.name));
    cols[1].replaceChildren(document.createTextNode(display.id));
    cols[2].replaceChildren(document.createTextNode(display.isPrimary));
    cols[3].replaceChildren(document.createTextNode(display.isInternal));
    cols[4].replaceChildren(document.createTextNode(display.resolution));
    cols[5].replaceChildren(document.createTextNode(`${display.bounds.width}x${display.bounds.height}`));
    delete display.bounds.height;
    delete display.bounds.width;
    cols[6].replaceChildren(document.createTextNode(JSON.stringify(display.bounds, null, 2)));
    displayTable.appendChild(displayRow);
  }
}

async function showActions(actionsObj, matchersObj, matchersWithInvalidActionsMap) {
  const actionsTableEl = document.getElementById('actionsTable');
  const actionsTableRowTemplate = document.getElementById('actionsTableRow');
  const actionsTableInvalidRow = document.getElementById('actionsTableInvalidRow');
  actionsTableEl.replaceChildren();

  // Prepare shortcuts map
  const commandIdPrefix = 'zzz-shortcut-';
  const shortcutsMap = new Map(
    (await chrome.commands.getAll())
       .filter((cmd) => cmd.name.startsWith(commandIdPrefix))
       .map(cmd => [parseInt(cmd.name.slice(commandIdPrefix.length), 10), cmd.shortcut || 'undefined'])
  );

  // prepare matchers amount map
  const matchersMap = new Map();
  for (const matcher of matchersObj) {
    for (const action of matcher.actions) {
      matchersMap.set(action, (matchersMap.has(action) ? [...matchersMap.get(action), matcher] : [matcher]));
    }
  }

  // prepare displays
  const displays = await Displays.getDisplays();
  
  for (const [actionId, matchers] of matchersWithInvalidActionsMap) {
    const displayRow = actionsTableInvalidRow.cloneNode(true);
    const cols = [...displayRow.getElementsByTagName('td')];

    cols[0].replaceChildren(document.createTextNode(actionId));
    cols[1].replaceChildren(document.createTextNode('invalid'));
    cols[2].replaceChildren(...(matchers.map((matcher) => createMatcherDiv(matcher))));
    cols[3].replaceChildren(document.createTextNode('invalid'));

    actionsTableEl.appendChild(displayRow);
  } 
  
  for (const action of actionsObj) {
    const displayRow = actionsTableRowTemplate.cloneNode(true);
    const cols = [...displayRow.getElementsByTagName('td')];

    cols[0].replaceChildren(document.createTextNode(action.id));
    cols[1].replaceChildren(document.createTextNode(action.display));
    cols[2].replaceChildren(document.createTextNode(Action.findDisplayByName(action.display, displays)===null ? 'not connected' : ''));
    cols[3].replaceChildren(...(matchersMap.get(action.id) || []).map((matcher) => createMatcherDiv(matcher)));
    cols[4].replaceChildren(document.createTextNode(action.menuName || ''));
    cols[5].replaceChildren(document.createTextNode(
      action.shortcutId
        ? `${shortcutsMap.get(action.shortcutId) || 'invalid id'} [${action.shortcutId}]`
        : ''));
    
    actionsTableEl.appendChild(displayRow);
  }
}

function createMatcherDiv(matcher) {
  const el = document.createElement('div')
  el.textContent = Matcher.from(matcher).toString();
  el.classList.add('matcherText')
  return el;
}

function setStatus(text) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = text;
  setTimeout(() => {
    statusEl.textContent = '';
  }, 5000);
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.addEventListener('DOMContentLoaded', showDisplays);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('validate').addEventListener('click', validateOptions);
document.getElementById('format').addEventListener('click', formatOptions);

document.getElementById('actionsInput').addEventListener('keyup', maybeValidateActions);
document.getElementById('matchersInput').addEventListener('keyup', maybeValidateMatchers);
document.getElementById('settingsInput').addEventListener('keyup', maybeValidateSettings);

chrome.system.display.onDisplayChanged.addListener(showDisplays);


document.addEventListener('keydown',
    function(event) {
      if (event.key === 's' && !event.shiftKey && !event.altKey &&
          // ctrl or mac-command=meta-key
          ( (event.ctrlKey && !event.metaKey) ||
            (!event.ctrlKey && event.metaKey))) {
        // Ctrl-S or CMD-S pressed
        saveOptions();
        event.preventDefault();
      }
    });

