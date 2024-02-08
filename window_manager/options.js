import {Action} from './classes/action.js';
import {Displays} from './classes/displays.js';
import {Matcher} from './classes/matcher.js';
import {Settings} from './classes/settings.js';
import {checkNonUndefined} from './utils/preconditions.js';

// As defined here: https://developer.chrome.com/docs/extensions/reference/api/storage
const QUOTA_BYTES_PER_ITEM = 8192;

/**
 * @param {string} name
 * @return {HTMLTextAreaElement}
 */
function getHTMLTextAreaElement(name) {
  const result = document.getElementById(name);
  if (!(result instanceof HTMLTextAreaElement)) {
    throw new Error(`Expected '${name}' to be a HTMLTextAreaElement, was: ${result}`);
  }
  return result;
}

/**
 * @param {HTMLElement} el
 * @return {HTMLElement}
 */
function cloneNode(el) {
  const result = el.cloneNode(true);
  if (!(result instanceof HTMLElement)) {
    throw new Error('Cloned element expected to be HTMLElement');
  }
  return result;
}

/** @return {Promise<void>} */
async function saveOptions() {
  const actions = getHTMLTextAreaElement('actionsInput').value;
  const matchers = getHTMLTextAreaElement('matchersInput').value;
  const settings = getHTMLTextAreaElement('settingsInput').value;

  if (await validateOptions()) {
    chrome.storage.sync.set(
        {
          actions: compress(actions),
          matchers: compress(matchers),
          settings: compress(settings),
        },
        () => {
          setStatus('Options saved');
        },
    );
  }
}

/**
 * @param {string} value
 * @return {string}
 */
function compress(value) {
  return JSON.stringify(JSON.parse(value));
}

/**
 * @param {string} value
 * @return {string}
 */
function format(value) {
  return JSON.stringify(JSON.parse(value), undefined, 2);
}

let maybeValidateActionsTimer = undefined;
/** @return {void} */
function maybeValidateActions() {
  if (maybeValidateActionsTimer) {
    clearTimeout(maybeValidateActionsTimer);
  }
  maybeValidateActionsTimer = setTimeout(validateActions, 100, false);
}

let maybeValidateMatchersTimer = undefined;
/** @return {void} */
function maybeValidateMatchers() {
  if (maybeValidateMatchersTimer) {
    clearTimeout(maybeValidateMatchersTimer);
  }
  maybeValidateMatchersTimer = setTimeout(validateMatchers, 100, false);
}

let maybeValidateSettingsTimer = undefined;
/** @return {void} */
function maybeValidateSettings() {
  if (maybeValidateSettingsTimer) {
    clearTimeout(maybeValidateSettingsTimer);
  }
  maybeValidateSettingsTimer = setTimeout(validateSettings, 100, false);
}

/** @return {boolean} */
function validateActions() {
  return validateField('actions', Action.validate);
}

/** @return {boolean} */
function validateMatchers() {
  return validateField('matchers', Matcher.validate);
}

/** @return {boolean} */
function validateSettings() {
  return validateField('settings', Settings.validate);
}

/**
 * @param {string} element
 * @param {function(string): void} validateFn
 * @return {boolean}
 */
function validateField(element, validateFn) {
  let json;
  const statusEl = checkNonUndefined(document.getElementById(element + 'InputStatus'));
  statusEl.textContent = '';
  statusEl.removeAttribute('class');

  try {
    json = compress(getHTMLTextAreaElement(element + 'Input').value);
    const size = new TextEncoder().encode(JSON.stringify({[element]: json})).length;
    checkNonUndefined(document.getElementById(element + 'Counter')).textContent = `${size}/${QUOTA_BYTES_PER_ITEM}`;
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
    for (const o of (Array.isArray(jsonObj) ? jsonObj : [jsonObj])) {
      validateFn(o);
    }
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.classList.add('warning');
    return false;
  }

  return true;
}

/** @return {Promise<boolean>} */
async function validateOptions() {
  // Use single "&" to make sure that all methods are called
  if (!((validateActions() ? 1 : 0) & (validateMatchers() ? 1 : 0) & (validateSettings() ? 1 : 0))) {
    setStatus('Invalid JSON configuration');
    return false;
  }

  const actionsObj = JSON.parse(getHTMLTextAreaElement('actionsInput').value);
  const matchersObj = JSON.parse(getHTMLTextAreaElement('matchersInput').value);

  const matchersWithInvalidActionsMap = findMatchersWithInvalidActions(actionsObj, matchersObj);

  // At this point JSONs are valid and we can show parsed actions
  await showActions(actionsObj, matchersObj, matchersWithInvalidActionsMap);
  await showDisplays();


  if (matchersWithInvalidActionsMap.size > 0) {
    const statusEl = checkNonUndefined(document.getElementById('matchersInputStatus'));
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
 * @return {Map<string, any>} if validated successfully
 */
function findMatchersWithInvalidActions(actionsObj, matchersObj) {
  const validActionIds = new Set(actionsObj.map((a) => a.id));
  const referencedActionIds = new Set(matchersObj.map((m)=> m.actions).flat());

  const result = new Map();
  for (const referencedActionId of referencedActionIds) {
    if (!validActionIds.has(referencedActionId)) {
      result.set(referencedActionId, matchersObj.filter((matcher) => (matcher.actions.includes(referencedActionId))));
    }
  }

  return result;
}

/** @return {Promise<void>} */
async function formatOptions() {
  const actions = getHTMLTextAreaElement('actionsInput').value;
  const matchers = getHTMLTextAreaElement('matchersInput').value;
  const settings = getHTMLTextAreaElement('settingsInput').value;

  if (await validateOptions()) {
    getHTMLTextAreaElement('actionsInput').value = format(actions);
    getHTMLTextAreaElement('matchersInput').value = format(matchers);
    getHTMLTextAreaElement('settingsInput').value = format(settings);
  }
}

/**
 * Restores the preferences from chrome.storage.
 * @return {void}
 */
function restoreOptions() {
  chrome.storage.sync.get(
      {actions: '', matchers: '', settings: ''},
      (items) => {
        getHTMLTextAreaElement('actionsInput').value = format(items.actions);
        getHTMLTextAreaElement('matchersInput').value = format(items.matchers);
        getHTMLTextAreaElement('settingsInput').value = format(items.settings);
        validateOptions();
      },
  );
}

/** @return {Promise<void>} */
async function showDisplays() {
  const displays = await Displays.getDisplays();

  let actionsObj = [];
  try {
    actionsObj = JSON.parse(getHTMLTextAreaElement('actionsInput').value);
  } catch (e) {
    // Ignore errors - if JSON is invalid, error message will be shown.
  }
  const displayMap = new Map(
      [...new Set(actionsObj.map((action) => action.display))].map((display) => [display, Action.findDisplayByName(display, displays)]),
  );

  // Sort displays by position on desktop -> left to right, then top to bottom
  displays.sort((d1, d2) => d1.bounds.top - d2.bounds.top);
  displays.sort((d1, d2) => d1.bounds.left - d2.bounds.left);

  const displayTable = checkNonUndefined(document.getElementById('displaysTable'));
  const displayRowTemplate = checkNonUndefined(document.getElementById('displaysTableRow'));
  const displayTableInvalidRowTemplate = checkNonUndefined(document.getElementById('displaysTableInvalidRow'));

  displayTable.replaceChildren();
  for (const display of displays) {
    const displayRow = cloneNode(displayRowTemplate);
    const cols = [...displayRow.getElementsByTagName('td')];

    cols[0].replaceChildren(document.createTextNode(display.name));
    cols[1].replaceChildren(document.createTextNode(display.id.toString()));
    cols[2].replaceChildren(document.createTextNode(display.isPrimary.toString()));
    cols[3].replaceChildren(document.createTextNode(display.isInternal.toString()));
    cols[4].replaceChildren(document.createTextNode(display.resolution));
    cols[5].replaceChildren(document.createTextNode(`${display.bounds.width}x${display.bounds.height}`));
    cols[6].replaceChildren(document.createTextNode(JSON.stringify(display.bounds, null, 2)));
    cols[7].replaceChildren(...(actionsObj.filter((action) => displayMap.get(action.display)?.id === display.id).map((action) => createTableChip(action.id))));
    displayTable.appendChild(displayRow);
  }

  const missingDisplays = new Set([...displayMap].filter(([display, matched]) => matched === null).map(([display, matched]) => display));
  for (const display of missingDisplays) {
    const displayRow = cloneNode(displayTableInvalidRowTemplate);
    const cols = [...displayRow.getElementsByTagName('td')];

    cols[0].replaceChildren(document.createTextNode(display));
    cols[1].replaceChildren(document.createTextNode(
        `Display '${display}' is referred by some of the actions but it doesn't exist (this is normal if the display is not currently connected).`,
    ));
    cols[2].replaceChildren(...(actionsObj.filter((action) => action.display === display).map((action) => createTableChip(action.id))));
    displayTable.appendChild(displayRow);
  }
}

/**
 * @param {Action[]} actionsObj
 * @param {Matcher[]} matchersObj
 * @param {Map<string, any>} matchersWithInvalidActionsMap
 * @return {Promise<void>}
 */
async function showActions(actionsObj, matchersObj, matchersWithInvalidActionsMap) {
  const actionsTableEl = checkNonUndefined(document.getElementById('actionsTable'));
  const actionsTableRowTemplate = checkNonUndefined(document.getElementById('actionsTableRow'));
  const actionsTableInvalidRow = checkNonUndefined(document.getElementById('actionsTableInvalidRow'));
  actionsTableEl.replaceChildren();

  // Prepare shortcuts map
  const commandIdPrefix = 'zzz-shortcut-';
  const shortcutsMap = new Map(
      (await chrome.commands.getAll())
          .filter((cmd) => cmd.name?.startsWith(commandIdPrefix))
          .map((cmd) => [parseInt(cmd.name?.slice(commandIdPrefix.length) || '-1', 10), cmd.shortcut || 'undefined']),
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
    const displayRow = cloneNode(actionsTableInvalidRow);
    const cols = [...displayRow.getElementsByTagName('td')];

    cols[0].replaceChildren(document.createTextNode(actionId));
    cols[1].replaceChildren(document.createTextNode('invalid'));
    cols[2].replaceChildren(...(matchers.map((matcher) => createMatcherDiv(matcher))));
    cols[3].replaceChildren(document.createTextNode('invalid'));

    actionsTableEl.appendChild(displayRow);
  }

  for (const action of actionsObj) {
    const displayRow = cloneNode(actionsTableRowTemplate);
    const cols = [...displayRow.getElementsByTagName('td')];
    const display = Action.findDisplayByName(action.display, displays);

    cols[0].replaceChildren(document.createTextNode(action.id));
    cols[1].replaceChildren(document.createTextNode(action.display));
    cols[2].replaceChildren(document.createTextNode(display===null ? 'not connected' : display.name));
    if (display===null) {
      cols[2].classList.add('warning');
    } else {
      cols[2].removeAttribute('class');
    }
    cols[3].replaceChildren(...(matchersMap.get(action.id) || []).map((matcher) => createMatcherDiv(matcher)));
    cols[4].replaceChildren(document.createTextNode(action.menuName || ''));
    cols[5].replaceChildren(document.createTextNode(
      action.shortcutId ?
        `${shortcutsMap.get(action.shortcutId) || 'invalid id'} [${action.shortcutId}]` :
        ''));

    actionsTableEl.appendChild(displayRow);
  }
}

/**
 * @param {Matcher} matcher
 * @return {HTMLElement}
 */
function createMatcherDiv(matcher) {
  return createTableChip(Matcher.from(matcher).toString());
}

/**
 * @param {string} val
 * @return {HTMLElement}
 */
function createTableChip(val) {
  const el = document.createElement('div');
  el.textContent = val;
  el.classList.add('tableChip');
  return el;
}

/**
 * @param {string} text
 * @return {void}
 */
function setStatus(text) {
  const statusEl = checkNonUndefined(document.getElementById('status'));
  statusEl.textContent = text;
  setTimeout(() => {
    statusEl.textContent = '';
  }, 5000);
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.addEventListener('DOMContentLoaded', showDisplays);
checkNonUndefined(document.getElementById('save')).addEventListener('click', saveOptions);
checkNonUndefined(document.getElementById('validate')).addEventListener('click', validateOptions);
checkNonUndefined(document.getElementById('format')).addEventListener('click', formatOptions);

checkNonUndefined(document.getElementById('actionsInput')).addEventListener('keyup', maybeValidateActions);
checkNonUndefined(document.getElementById('matchersInput')).addEventListener('keyup', maybeValidateMatchers);
checkNonUndefined(document.getElementById('settingsInput')).addEventListener('keyup', maybeValidateSettings);

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

