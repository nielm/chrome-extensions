import {Action} from './classes/action.js';
import {Displays} from './classes/displays.js';
import {Matcher} from './classes/matcher.js';
import {Storage} from './classes/storage.js';
import {checkNonUndefined} from './utils/preconditions.js';
import {JSONEditor, Mode, createAjvValidator} from './jsoneditor/standalone.js';
import * as schemaValidator from './jsoneditor/schema-validator.js';

// As defined here: https://developer.chrome.com/docs/extensions/reference/api/storage
const QUOTA_BYTES_PER_ITEM = 8192;

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
 * Performs simple validation of json text.
 *
 * @return {ValidatedConfiguration}
 * @throws {SyntaxError} on invalid JSON
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
 * @throws {Error} on invalid configuration.
 */
async function validateEverything() {
  let isValid = true;

  // Check editors validation state:
  if (actionsEditor.validate() != null) {
    setWarning('actions', 'Validation failed');
    isValid = false;
  } else {
    setWarning('actions', '');
  }
  if (matchersEditor.validate() != null) {
    setWarning('matchers', 'Validation failed');
    isValid = false;
  } else {
    setWarning('matchers', '');
  }
  if (settingsEditor.validate() != null) {
    setWarning('settings', 'Validation failed');
    isValid = false;
  } else {
    setWarning('settings', '');
  }

  if (!isValid) {
    throw new Error('Invalid configuration');
  }

  // Check JSON validation state:
  const validatedConfig = validateJson();

  if (! validatedConfig.valid) {
    throw new Error('Invalid configuration');
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

/**
 * @typedef {import('ajv').default} Ajv
 * @typedef {import('vanilla-jsoneditor/standalone.js').Validator} Validator
 */

/**
 * This is a hack around the JsonEditor's lack of support for precompiled
 * schema validators, and on-demand compiled validators cannot be used
 * because chrome extensions do not support eval()
 *
 * This returns a replacement for the Ajv instance created by the JsonEditor,
 * providing the minimum required properties which include a compile() function
 * that returns the precompiled validator.
 *
 * Used as an onCreateAjv option to {@link createAjvValidator}
 *
 * @see https://github.com/josdejong/svelte-jsoneditor/blob/main/src/lib/plugins/validator/createAjvValidator.ts#L46
 *
 * @param {Function} validateFunction
 * @return {Validator} stub Ajv instance.
 */
function getStubAjvForValidator(validateFunction) {
  /** @type{Ajv} */
  const stubAjv = {
    // @ts-expect-error
    opts: {
      verbose: true,
    },
    // @ts-expect-error
    compile: () => {
      return validateFunction;
    },
  };

  return createAjvValidator(
      {
        schema: {},
        onCreateAjv: () => {
          return stubAjv;
        },
      });
}

/**
 * Builds a JSONEditor for the given parameters.
 *
 * @param {String} elementId
 * @param {*} initialValue
 * @param {Function} precompiledValidator
 * @return {JSONEditor}
 */
function createJSONEditorForElement(elementId, initialValue, precompiledValidator) {
  return new JSONEditor({
    target: checkNonUndefined(document.getElementById(elementId)),
    props: {
      content: {json: initialValue},
      mode: Mode.text,
      navigationBar: false,
      validator: getStubAjvForValidator(precompiledValidator),
      onChange: onEditorChanged,
    },
  });
}

/**
 * @param {JSONEditor} editor
 * @return {String}
 * @throws {SyntaxError} on invalid JSON
 */
function getJsonTextFromEditor(editor) {
  const content = editor.get();
  if ('text' in content && content.text) {
    // remove whitespace.
    return JSON.stringify(JSON.parse(content.text));
  } if ('json' in content && content.json) {
    return JSON.stringify(content.json);
  } else {
    throw new Error('unexpected content from json Editor: '+content);
  }
}


// ######################################################
// #                 Event Handlers                     #
// ######################################################

/**
 * Loads the config, and sets up editors.
 */
function onPageLoad() {
  actionsEditor= createJSONEditorForElement('actionsInput', [], schemaValidator.actions);
  matchersEditor = createJSONEditorForElement('matchersInput', [], schemaValidator.matchers);
  settingsEditor = createJSONEditorForElement('settingsInput', {}, schemaValidator.settings);

  new Storage().getRawConfiguration().then((config) => {
    actionsEditor.set({text: config.actions});
    matchersEditor.set({text: config.matchers});
    settingsEditor.set({text: config.settings});
    // Make editors visible.
    [...document.getElementsByClassName('jsonEditor')].forEach(
        (/** @type {HTMLElement} */ e) => e.style.display='');
    // Remove "Loading" messages.
    [...document.getElementsByClassName('loading')].forEach(
        (/** @type {HTMLElement} */ e) => e.style.display='none');
    updateCounters();
    validateEverything(); // async
  });
}


/** @return {Promise<void>} */
async function onDisplayChanged() {
  const validatedConfig = validateJson();
  await showDisplays(validatedConfig.actions);
}


/** @return {Promise<void>} */
async function onSaveClick() {
  try {
    const validatedConfig = await validateEverything();
    const storage = new Storage();

    await storage.save(validatedConfig);
    setStatus('Options saved');
  } catch {
    setStatus('Could not save invalid configuration');
  }
}

/**
 * Perform validation
 */
function onValidateClick() {
  try {
    validateEverything();
    setStatus('');
  } catch {
    setStatus('Invalid configuration');
  }
}

let countersTimer = undefined;
/**
 * Executed when editor contents are changed.
 *
 * Update counters - validation is done by editor.
 */
function onEditorChanged() {
  if (countersTimer) {
    clearTimeout(countersTimer);
  }
  countersTimer = setTimeout(updateCounters, 500);
}

/**
 * Update the Actions and Matchers counters with the current text size.
 */
function updateCounters() {
  countersTimer = undefined;
  const encoder = new TextEncoder();
  let size;
  try {
    size = encoder.encode(getJsonTextFromEditor(actionsEditor)).length.toString();
  } catch {
    size='???';
  }
  checkNonUndefined(document.getElementById('actionsCounter')).textContent = `${size}/${QUOTA_BYTES_PER_ITEM}`;


  try {
    size = encoder.encode(getJsonTextFromEditor(matchersEditor)).length.toString();
  } catch {
    size='???';
  }
  checkNonUndefined(document.getElementById('matchersCounter')).textContent = `${size}/${QUOTA_BYTES_PER_ITEM}`;
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
