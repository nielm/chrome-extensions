function saveOptions() {
  const actions = document.getElementById('actionsInput').value;
  const matchers = document.getElementById('matchersInput').value;
  const settings = document.getElementById('settingsInput').value;

  if (validateOptions()) {
    chrome.storage.sync.set(
      {actions, matchers, settings},
      () => {
        setStatus('Options saved');
      }
    );
  } else {
    setStatus('Invalid json');
  }
}

function validateOptions() {
  const actions = document.getElementById('actionsInput').value;
  const matchers = document.getElementById('matchersInput').value;
  const settings = document.getElementById('settingsInput').value;

  let valid = true;
  try {
    JSON.parse(actions);
    document.getElementById('actionsInputStatus').textContent = '';
  } catch (e) {
    document.getElementById('actionsInputStatus').textContent = e.message;
    valid = false;
  }

  try {
    JSON.parse(matchers);
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

  if (valid) {
    setStatus('Valid');
  }

  return valid;
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

