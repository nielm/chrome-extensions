import {Action} from './classes/action.js';
import {Displays} from './classes/displays.js';

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
          setStatus('Options saved');
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

let maybeUpdateStatusTimer = undefined;
function maybeUpdateStatus() {
  if (maybeUpdateStatusTimer) {
    clearTimeout(maybeUpdateStatusTimer);
  }
  maybeUpdateStatusTimer = setTimeout(validateOptions, 500, false);
}

async function validateOptions(extended = true) {
  let valid = true;
  let actions;
  let matchers;
  let settings;

  try {
    actions = compress(document.getElementById('actionsInput').value);
    const size = new TextEncoder().encode(JSON.stringify({actions})).length;
    document.getElementById('actionsCounter').textContent = `${size}/${QUOTA_BYTES_PER_ITEM}`;
    if (size > QUOTA_BYTES_PER_ITEM) {
      throw new Error(`Configuration size ${size}b is greater than allowed: ${QUOTA_BYTES_PER_ITEM}b`);
    }
    document.getElementById('actionsInputStatus').textContent = 'OK';
    document.getElementById('actionsInputStatus').removeAttribute('class');
  } catch (e) {
    document.getElementById('actionsInputStatus').textContent = e.message;
    document.getElementById('actionsInputStatus').classList.add('warning');
    valid = false;
  }

  try {
    matchers = compress(document.getElementById('matchersInput').value);
    const size = new TextEncoder().encode(JSON.stringify({matchers})).length;
    document.getElementById('matchersCounter').textContent = `${size}/${QUOTA_BYTES_PER_ITEM}`;
    if (size > QUOTA_BYTES_PER_ITEM) {
      throw new Error(`Configuration size ${size}b is greater than allowed: ${QUOTA_BYTES_PER_ITEM}b`);
    }
    document.getElementById('matchersInputStatus').textContent = 'OK';
    document.getElementById('matchersInputStatus').removeAttribute('class');
  } catch (e) {
    document.getElementById('matchersInputStatus').textContent = e.message;
    document.getElementById('matchersInputStatus').classList.add('warning');
    valid = false;
  }

  try {
    settings = compress(document.getElementById('settingsInput').value);
    const size = new TextEncoder().encode(JSON.stringify({settings})).length;
    document.getElementById('settingsCounter').textContent = `${size}/${QUOTA_BYTES_PER_ITEM}`;
    if (size > QUOTA_BYTES_PER_ITEM) {
      throw new Error(`Configuration size ${size}b is greater than allowed: ${QUOTA_BYTES_PER_ITEM}b`);
    }
    document.getElementById('settingsInputStatus').textContent = 'OK';
    document.getElementById('settingsInputStatus').removeAttribute('class');
  } catch (e) {
    document.getElementById('settingsInputStatus').textContent = e.message;
    document.getElementById('settingsInputStatus').classList.add('warning');
    valid = false;
  }

  // JSON validation completed
  if (!valid) {
    setStatus('Invalid JSON configuration');
    return valid;
  }

  if (!extended) {
    return valid;
  }

  const hasWarnings = !await warnForIncorrectMonitorIds(JSON.parse(actions));

  // verify matchers reference valid actions.
  valid = validateMatchersAndActions(JSON.parse(actions), JSON.parse(matchers));

  if (valid) {
    if (hasWarnings) {
      setStatus('Valid with warnings - see above.');
    } else {
      setStatus('Configuration validated.');
    }
  } else {
    setStatus('Incorrect configuration - see above.');
  }
  return valid;
}

/**
 * Verify that all Matchers reference a valid Action
 * @param {*} actionsObj
 * @param {*} matchersObj
 * @return {boolean} if validated successfully
 */
function validateMatchersAndActions(actionsObj, matchersObj) {
  const actionIDs = new Set(actionsObj.map((a) => a.id));
  const referencedActionIDs = new Set(matchersObj.map((m)=> m.actions).flat());

  const missingActionIds = [...referencedActionIDs.values()].filter((id) => !actionIDs.has(id));
  if (missingActionIds.length > 0) {
    document.getElementById('matchersInputStatus').textContent = `Matchers refer to unknown Action ids: ${JSON.stringify(missingActionIds, null, 2)}`;
    document.getElementById('matchersInputStatus').classList.add('info');
    return false;
  }
  document.getElementById('matchersInputStatus').classList.remove('info');
  return true;
}

/**
 * Check that referenced displays are actually present, and warn if not
 *
 * @param {*} actionsObj
 * @return {boolean} if no warnings occurred.
 */
async function warnForIncorrectMonitorIds(actionsObj) {
  const displays = await Displays.getDisplays();
  const actionDisplayNames = new Set(actionsObj.map((a) => a.display));

  const missingDisplayNames = [...actionDisplayNames.values()]
      .filter((d) => Action.findDisplayByName(d, displays)===null);

  if (missingDisplayNames.length>0) {
    document.getElementById('actionsInputStatus').textContent =
        `Warning: Actions refer to the following unknown display names (This is normal if they are not currently connected): ${JSON.stringify(missingDisplayNames, null, 2)}`;
    document.getElementById('actionsInputStatus').classList.add('info');
    return false;
  }
  document.getElementById('actionsInputStatus').classList.remove('info');
  return true;
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
  const status = document.getElementById('status');
  status.textContent = text;
  setTimeout(() => {
    status.textContent = '';
  }, 5000);
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.addEventListener('DOMContentLoaded', showDisplays);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('validate').addEventListener('click', validateOptions);
document.getElementById('format').addEventListener('click', formatOptions);

chrome.system.display.onDisplayChanged.addListener(showDisplays);

document.addEventListener('keyup', maybeUpdateStatus);
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

