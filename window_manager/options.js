import {filterWithDisplay, matchActionsToDisplay, Action, ActionWithDisplay} from './classes/action.js';
import {Displays} from './classes/displays.js';
import {matchMatcherToAction, Matcher, MatcherWithAction} from './classes/matcher.js';
import {Storage, StorageToJson} from './classes/storage.js';
import {checkNonUndefined} from './utils/preconditions.js';
import {combine2} from './utils/promise.js';


/**
 * @typedef {import('./classes/storage.js').ValidatedConfiguration} ValidatedConfiguration
 */

const storage = new Storage();

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


/**
 * @param {string} field
 * @param {string} message
 * @return {void}
 */
function setWarning(field, message) {
  const statusEl = checkNonUndefined(document.getElementById(field + 'InputStatus'));
  statusEl.textContent = message;
  statusEl.removeAttribute('class');
  if (message) {
    statusEl.classList.add('warning');
  }
}

/**
 * Performs simple validation of json text.
 *
 * @return {ValidatedConfiguration}
 */
function validateJson() {
  const config = {
    actions: getHTMLTextAreaElement('actionsInput').value,
    matchers: getHTMLTextAreaElement('matchersInput').value,
    settings: getHTMLTextAreaElement('settingsInput').value,
  };
  const validatedConfig = storage.parse(config);

  setWarning('actions', validatedConfig.actionsValidation);
  setWarning('matchers', validatedConfig.matchersValidation);
  setWarning('settings', validatedConfig.settingsValidation);

  return validatedConfig;
}

/**
 * Performs full validation.
 *
 * @return {Promise<ValidatedConfiguration>}
 */
async function validateEverything() {
  const validatedConfig = validateJson();
  if (!validatedConfig.valid) {
    return validatedConfig;
  }

  const matchersWithInvalidActionsMap = findMatchersWithInvalidActions(validatedConfig.actions, validatedConfig.matchers);

  // At this point JSONs are valid and we can show parsed actions
  await showActions(validatedConfig.actions, validatedConfig.matchers, matchersWithInvalidActionsMap);
  await showDisplays(validatedConfig.actions);

  if (matchersWithInvalidActionsMap.size > 0) {
    const statusEl = checkNonUndefined(document.getElementById('matchersInputStatus'));
    statusEl.classList.add('warning');
    statusEl.textContent = `Matchers refer to unknown Action ids: ${Array.from(matchersWithInvalidActionsMap.keys())}. See "Parsed actions" section for details.`;

    setStatus('Incorrect configuration - see above.');
    validatedConfig.valid = false;
  }

  return validatedConfig;
}

/**
 * Verify that all Matchers reference a valid Action
 * @param {Action[]} actionsObj
 * @param {Matcher[]} matchersObj
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


/**
 * @param {Action[]} configuredActions
 * @return {Promise<void>}
 */
async function showDisplays(configuredActions) {
  const displays = await Displays.getDisplays();
  const actions = await combine2(Promise.resolve(configuredActions), Promise.resolve(displays), matchActionsToDisplay);
  const actionsWithDisplay = filterWithDisplay(actions);
  const actionsWithoutDisplay = actions.filter((a) => (!(a instanceof ActionWithDisplay)));

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
    cols[7].replaceChildren(...actionsWithDisplay.filter((a) => a.matchedDisplay.id === display.id).map((action) => createTableChip(action.id)));

    displayTable.appendChild(displayRow);
  }

  const missingDisplays = new Set(actionsWithoutDisplay.map((a) => a.display));

  for (const missingDisplay of missingDisplays) {
    const displayRow = cloneNode(displayTableInvalidRowTemplate);
    const cols = [...displayRow.getElementsByTagName('td')];

    cols[0].replaceChildren(document.createTextNode(missingDisplay));
    cols[1].replaceChildren(document.createTextNode(
        `Display '${missingDisplay}' is referred by some of the actions but it doesn't exist (this is normal if the display is not currently connected).`,
    ));
    cols[2].replaceChildren(...actionsWithoutDisplay.filter((action) => action.display === missingDisplay).map((action) => createTableChip(action.id)));
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
          .map((cmd) => [parseInt(cmd.name?.slice(commandIdPrefix.length) || '-1', 10), cmd.shortcut]),
  );

  const actions = await combine2(Promise.resolve(actionsObj), Displays.getDisplays(), matchActionsToDisplay);
  const matchers = await combine2(Promise.resolve(matchersObj), Promise.resolve(filterWithDisplay(actions)), matchMatcherToAction);

  for (const [actionId, matchers] of matchersWithInvalidActionsMap) {
    const displayRow = cloneNode(actionsTableInvalidRow);
    const cols = [...displayRow.getElementsByTagName('td')];

    cols[0].replaceChildren(document.createTextNode(actionId));
    cols[1].replaceChildren(document.createTextNode('invalid'));
    cols[2].replaceChildren(...(matchers.map((matcher) => createMatcherDiv(matcher))));
    cols[3].replaceChildren(document.createTextNode('invalid'));

    actionsTableEl.appendChild(displayRow);
  }


  for (const action of actions) {
    const displayRow = cloneNode(actionsTableRowTemplate);
    const cols = [...displayRow.getElementsByTagName('td')];

    cols[0].replaceChildren(document.createTextNode(action.id));
    cols[1].replaceChildren(document.createTextNode(action.display));
    cols[2].replaceChildren(document.createTextNode(action instanceof ActionWithDisplay ? action.matchedDisplay.name : 'not connected'));
    if (action instanceof ActionWithDisplay) {
      cols[2].removeAttribute('class');
    } else {
      cols[2].classList.add('warning');
    }

    cols[3].replaceChildren(...matchers.filter((m) => m.actions.some((a) => a === action.id))
        .map((m) => createMatcherDiv(m, m instanceof MatcherWithAction && m.matchedAction.id === action.id)),
    );

    cols[4].replaceChildren(document.createTextNode(action.menuName || ''));

    const mappedShortcut = shortcutsMap.get(action.shortcutId);
    cols[5].replaceChildren(document.createTextNode(
      action.shortcutId ? `${mappedShortcut || 'not set'} [${action.shortcutId}]` : ''));
    if (action.shortcutId && !mappedShortcut) {
      cols[5].classList.add('warning');
    } else {
      cols[5].removeAttribute('class');
    }

    actionsTableEl.appendChild(displayRow);
  }
}

/**
 * @param {Matcher} matcher
 * @param {boolean=} matched
 * @return {HTMLElement}
 */
function createMatcherDiv(matcher, matched = false) {
  const result = createTableChip(matcher.toString());
  if (matched) {
    result.classList.add('matchedMatcherChip');
  }
  return result;
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

// ######################################################
// #                 Event Handlers                     #
// ######################################################

/**
 * Restores the preferences from the storage.
 * @return {void}
 */
function onPageLoad() {
  storage.getRawConfiguration()
      .then((items) => {
        getHTMLTextAreaElement('actionsInput').value = items.actions;
        getHTMLTextAreaElement('matchersInput').value = items.matchers;
        getHTMLTextAreaElement('settingsInput').value = items.settings;
      },
      ).then(() => validateEverything())
  ;
}


/** @return {Promise<void>} */
async function onDisplayChanged() {
  const validatedConfig = validateJson();
  await showDisplays(validatedConfig.actions);
}


/** @return {Promise<void>} */
async function onSaveClick() {
  const validatedConfig = await validateEverything();

  return storage.save(validatedConfig)
      .then(() => setStatus('Options saved'))
      .catch((e) => setStatus(e.message));
}

/** @return {Promise<void>} */
async function onValidateClick() {
  await validateEverything();
}

/** @return {Promise<void>} */
async function onFormatClick() {
  const validatedConfig = await validateJson();

  if (validatedConfig.valid) {
    getHTMLTextAreaElement('actionsInput').value = StorageToJson.actions(validatedConfig.actions);
    getHTMLTextAreaElement('matchersInput').value = StorageToJson.matchers(validatedConfig.matchers);
    getHTMLTextAreaElement('settingsInput').value = StorageToJson.settings(validatedConfig.settings);
  }
}

let textAreaValidationTimer = undefined;
/**
 * @param {KeyboardEvent} event
 * @return {void}
 */
function onTextAreaKeyUp(event) {
  if (textAreaValidationTimer) {
    clearTimeout(textAreaValidationTimer);
  }
  textAreaValidationTimer = setTimeout(validateJson, 100);
}

/**
 * @param {KeyboardEvent} event
 * @return {void}
 */
function onKeyDown(event) {
  if (event.key === 's' && !event.shiftKey && !event.altKey &&
          // ctrl or mac-command=meta-key
          ( (event.ctrlKey && !event.metaKey) ||
            (!event.ctrlKey && event.metaKey))) {
    // Ctrl-S or CMD-S pressed
    onSaveClick();
    event.preventDefault();
  }
}

document.addEventListener('DOMContentLoaded', onPageLoad);
document.addEventListener('DOMContentLoaded', onDisplayChanged);
document.addEventListener('keydown', onKeyDown);
checkNonUndefined(document.getElementById('save')).addEventListener('click', onSaveClick);
checkNonUndefined(document.getElementById('validate')).addEventListener('click', onValidateClick);
checkNonUndefined(document.getElementById('format')).addEventListener('click', onFormatClick);

checkNonUndefined(document.getElementById('actionsInput')).addEventListener('keyup', onTextAreaKeyUp);
checkNonUndefined(document.getElementById('matchersInput')).addEventListener('keyup', onTextAreaKeyUp);
checkNonUndefined(document.getElementById('settingsInput')).addEventListener('keyup', onTextAreaKeyUp);

chrome.system.display.onDisplayChanged.addListener(onDisplayChanged);
