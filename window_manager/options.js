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
  return validateField('actions') && validateContent('actions', Action.validate);
}

function validateMatchers() {
  return validateField('matchers') && validateContent('matchers', Matcher.validate);
}

function validateSettings() {
  return validateField('settings') && validateContent('settings', Settings.validate);
}

function validateField(element) {
  const statusEl = document.getElementById(element + 'InputStatus');
  statusEl.textContent = '';
  statusEl.removeAttribute('class');

  try {
    const config = compress(document.getElementById(element + 'Input').value);
    const size = new TextEncoder().encode(JSON.stringify({[element]: config})).length;
    document.getElementById(element + 'Counter').textContent = `${size}/${QUOTA_BYTES_PER_ITEM}`;
    if (size > QUOTA_BYTES_PER_ITEM) {
      throw new Error(`Configuration size ${size}b is greater than allowed: ${QUOTA_BYTES_PER_ITEM}b`);
    }
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.classList.add('warning');
    return false;
  }

  return true;
}

function validateContent(element, validateFn) {
  const jsonObj = JSON.parse(document.getElementById(element + 'Input').value);
  const statusEl = document.getElementById(element + 'InputStatus');
  statusEl.textContent = '';
  statusEl.removeAttribute('class');

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

  const missingMonitorIds = await findMissingMonitorIds(actionsObj);
  const missingActionIds = findMissingActionIds(actionsObj, matchersObj);

  if (missingMonitorIds.length > 0) {
    const statusEl = document.getElementById('actionsInputStatus');
    statusEl.classList.add('info');
    statusEl.textContent = `Warning: Actions refer to the following unknown display names (This is normal if they are not currently connected): ${JSON.stringify(missingMonitorIds, null, 2)}`
  }

  if (missingActionIds.length > 0) {
    const statusEl = document.getElementById('matchersInputStatus');
    statusEl.classList.add('warning');
    statusEl.textContent = `Matchers refer to unknown Action ids: ${JSON.stringify(missingActionIds, null, 2)}`;

    setStatus('Incorrect configuration - see above.');
    return false;
  } else {
    if (missingMonitorIds.length > 0) {
      setStatus('Valid with warnings - see above.');
    } else {
      setStatus('Configuration validated.');
    }
    return true;
  }
}

/**
 * Verify that all Matchers reference a valid Action
 * @param {*} actionsObj
 * @param {*} matchersObj
 * @return {boolean} if validated successfully
 */
function findMissingActionIds(actionsObj, matchersObj) {
  const actionIDs = new Set(actionsObj.map((a) => a.id));
  const referencedActionIDs = new Set(matchersObj.map((m)=> m.actions).flat());

  return [...referencedActionIDs.values()].filter((id) => !actionIDs.has(id));
}

/**
 * Check that referenced displays are actually present, and warn if not
 *
 * @param {*} actionsObj
 * @return {boolean} if no warnings occurred.
 */
async function findMissingMonitorIds(actionsObj) {
  const displays = await Displays.getDisplays();
  const actionDisplayNames = new Set(actionsObj.map((a) => a.display));

  return [...actionDisplayNames.values()]
      .filter((d) => Action.findDisplayByName(d, displays)===null);
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

