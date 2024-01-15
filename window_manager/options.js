async function saveOptions() {
  const actions = document.getElementById('actionsInput').value;
  const matchers = document.getElementById('matchersInput').value;
  const settings = document.getElementById('settingsInput').value;

  if (await validateOptions()) {
    chrome.storage.sync.set(
      {actions, matchers, settings},
      () => {
        setStatus('Options saved');
      }
    );
  }
}

async function validateOptions() {
  const actions = document.getElementById('actionsInput').value;
  const matchers = document.getElementById('matchersInput').value;
  const settings = document.getElementById('settingsInput').value;

  let valid = true;
  let actionsObj;
  let matchersObj;
  try {
    actionsObj = JSON.parse(actions);
    document.getElementById('actionsInputStatus').textContent = '';
  } catch (e) {
    document.getElementById('actionsInputStatus').textContent = e.message;
    valid = false;
  }

  try {
    matchersObj=JSON.parse(matchers);
    document.getElementById('matchersInputStatus').textContent = '';
  } catch (e) {
    document.getElementById('matchersInputStatus').textContent = e.message;
    valid = false;
  }

  try {
    JSON.parse(settings);
    document.getElementById('settingsInputStatus').textContent = '';
  } catch (e) {
    document.getElementById('settingsInputStatus').textContent = e.message;
    valid = false;
  }

  // JSON validation completed
  //
  if (! valid) {
    setStatus('Invalid JSON');
    return valid;
  }

  const hasWarnings = ! await warnForIncorrectMonitorIds(actionsObj);

  // verify matchers reference valid actions.
  valid = validateMatchersAndActions(actionsObj, matchersObj);

  if(valid) {
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
 * @returns {boolean} if validated successfully
 */
function validateMatchersAndActions(actionsObj, matchersObj) {
  const actionIDs = new Set(actionsObj.map((a) => a.id));
  const referencedActionIDs = new Set(matchersObj.map((m)=> m.actions).flat());

  const missingActionIds = [...referencedActionIDs.values()].filter((id) => !actionIDs.has(id));
  if(missingActionIds.length > 0) {
    document.getElementById('matchersInputStatus').textContent = `matchers refer to unknown action ids: ${JSON.stringify(missingActionIds,null,2)}`;
    return false;
  }
  return true;
}

/**
 * Check that referenced displays are actually present, and warn if not
 *
 * @param {*} actionsObj
 * @returns {boolean} if no warnings occurred.
 */
async function warnForIncorrectMonitorIds(actionsObj){
  const displays = await chrome.system.display.getInfo({});

  const displayNames = new Set(
    [
      ...displays.map((d) => d.name),
      ...displays.map((d) => d.id),
    ]);
  displayNames.add("primary");
  if ( displays.filter((d) => d.isPrimary===false).length>0) {
    displayNames.add("-primary")
  };
  if ( displays.filter((d) => d.isInternal).length>0) {
    displayNames.add("internal")
  };
  if ( displays.filter((d) => d.isInternal===false).length>0) {
    displayNames.add("-internal")
  };

  const actionDisplayNames = new Set(actionsObj.map((a) => a.display));

  const missingDisplayNames = [...actionDisplayNames.values()].filter((d) => !displayNames.has(d));
  if(missingDisplayNames.length>0){
    document.getElementById('actionsInputStatus').textContent = `Warning: Actions refer to the following unknown display names (This is normal if they are not currently connected): ${JSON.stringify(missingDisplayNames,null,2)}`;
    return false;
  }
  return true;
}


function formatOptions() {
  const actions = document.getElementById('actionsInput').value;
  const matchers = document.getElementById('matchersInput').value;
  const settings = document.getElementById('settingsInput').value;

  if (validateOptions()) {
    document.getElementById('actionsInput').value = JSON.stringify(JSON.parse(actions), undefined, 2);
    document.getElementById('matchersInput').value = JSON.stringify(JSON.parse(matchers), undefined, 2);
    document.getElementById('settingsInput').value = JSON.stringify(JSON.parse(settings), undefined, 2);
  }
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restoreOptions() {
  chrome.storage.sync.get(
    {actions: '', matchers: '', settings: ''},
    (items) => {
      document.getElementById('actionsInput').value = items.actions;
      document.getElementById('matchersInput').value = items.matchers;
      document.getElementById('settingsInput').value = items.settings;
    }
  );
}

async function showDisplays() {
  const displays = await chrome.system.display.getInfo({});
  const el = document.getElementById('displays');
  el.textContent = '';
  for (const display of displays) {
    const displayEl = document.createElement('li');
    displayEl.textContent = `name: '${display.name}', primary: '${display.isPrimary}', internal: '${display.isInternal}'`;
    el.appendChild(displayEl);
  }
}

function setStatus(text) {
  const status = document.getElementById('status');
  status.textContent = text;
  setTimeout(() => {
    status.textContent = '';
  }, 2000);
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.addEventListener('DOMContentLoaded', showDisplays);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('validate').addEventListener('click', validateOptions);
document.getElementById('format').addEventListener('click', formatOptions);

