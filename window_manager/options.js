import {Action} from './classes/action.js';
import {Displays} from './classes/displays.js';
import {Matcher} from './classes/matcher.js';
import {Storage} from './classes/storage.js';
import {checkNonUndefined} from './utils/preconditions.js';
import {JSONEditor, Mode} from './jsoneditor/standalone.js';

/**
 * @typedef {import('./classes/storage.js').ValidatedConfiguration} ValidatedConfiguration
 */

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
 * @param {JSONEditor} editor
 * @return {String}
 */
function getJsonTextFromEditor(editor) {
  const content = editor.get();
  if ('text' in content && content.text) {
    return content.text;
  } if ('json' in content && content.json) {
    return JSON.stringify(content.json, undefined, 2);
  } else {
    throw new Error('unexpected content from json Editor: '+content);
  }
}

/**
 * Performs simple validation of json text.
 *
 * @return {ValidatedConfiguration}
 */
function validateJson() {
  const storage = new Storage();
  const config = {
    actions: getJsonTextFromEditor(actionsEditor),
    matchers: getJsonTextFromEditor(matchersEditor),
    settings: getJsonTextFromEditor(settingsEditor),
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
  let isValid = true;
  isValid ||= (actionsEditor.validate() == null);
  isValid ||= (matchersEditor.validate() == null);
  isValid ||= (settingsEditor.validate() == null);

  const validatedConfig = validateJson();
  isValid ||= validatedConfig.valid;

  if (! isValid) {
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

  const displayMap = new Map(
      [...new Set(configuredActions.map((action) => action.display))].map((display) => [display, Action.findDisplayByName(display, displays)]),
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
    cols[7].replaceChildren(...(configuredActions.filter((action) => displayMap.get(action.display)?.id === display.id).map((action) => createTableChip(action.id))));
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
    cols[2].replaceChildren(...(configuredActions.filter((action) => action.display === display).map((action) => createTableChip(action.id))));
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
  return createTableChip(matcher.toString());
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
// #                 JSON editors                       #
// ######################################################
/** @type {JSONEditor} */
let actionsEditor;
/** @type {JSONEditor} */
let matchersEditor;
/** @type {JSONEditor} */
let settingsEditor;

// ######################################################
// #                 Event Handlers                     #
// ######################################################

/**
 * Loads the config, and sets up editors.
 */
function onPageLoad() {
  actionsEditor = new JSONEditor({
    target: checkNonUndefined(document.getElementById('actionsInput')),
    props: {
      content: {text: '[]'},
      mode: Mode.text,
      navigationBar: false,
      onChange: onEditorChanged,
    },
  });

  matchersEditor = new JSONEditor({
    target: checkNonUndefined(document.getElementById('matchersInput')),
    props: {
      content: {text: '[]'},
      mode: Mode.text,
      navigationBar: false,
      onChange: onEditorChanged,
    },
  });

  settingsEditor = new JSONEditor({
    target: checkNonUndefined(document.getElementById('settingsInput')),
    props: {
      content: {text: '{}'},
      mode: Mode.text,
      navigationBar: false,
      onChange: onEditorChanged,
    },
  });

  new Storage().getRawConfiguration().then((config) => {
    actionsEditor.set({text: config.actions});
    matchersEditor.set({text: config.matchers});
    settingsEditor.set({text: config.settings});
    // Remove Loading markers.
    [...document.getElementsByClassName('loading')].forEach((e) => e.remove());
    validateEverything();
  });
}


/** @return {Promise<void>} */
async function onDisplayChanged() {
  const validatedConfig = validateJson();
  await showDisplays(validatedConfig.actions);
}


/** @return {Promise<void>} */
async function onSaveClick() {
  const validatedConfig = await validateEverything();
  const storage = new Storage();

  return storage.save(validatedConfig)
      .then(() => setStatus('Options saved'))
      .catch((e) => setStatus(e.message));
}

/** @return {Promise<void>} */
async function onValidateClick() {
  await validateEverything();
}

let textAreaValidationTimer = undefined;
/**
 * Executed when editor contents are changed.
 */
function onEditorChanged() {
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

chrome.system.display.onDisplayChanged.addListener(onDisplayChanged);
