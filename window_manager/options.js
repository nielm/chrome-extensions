import {filterWithDisplay, matchActionsToDisplay, Action, ActionWithDisplay} from './classes/action.js';
import {Displays} from './classes/displays.js';
import {matchMatcherToAction, Matcher, MatcherWithAction} from './classes/matcher.js';
import {Storage} from './classes/storage.js';
import {checkNonUndefined} from './utils/preconditions.js';
import {combine2} from './utils/promise.js';
import * as StandaloneJsonEditor from './jsoneditor/standalone.js';
import * as schemaValidator from './jsoneditor/schema-validator.js';

/**
 * @typedef {import('./classes/storage.js').ValidatedConfiguration} ValidatedConfiguration
 */

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
  const config = {
    actions: getJsonTextFromEditor(actionsEditor),
    matchers: getJsonTextFromEditor(matchersEditor),
    settings: getJsonTextFromEditor(settingsEditor),
  };
  const validatedConfig = Storage.parse(config);

  // Also check editors validation.
  if (actionsEditor.validate() != null || matchersEditor.validate() != null || settingsEditor.validate() != null) {
    validatedConfig.valid = false;
  }

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
  // Check JSON validation state:
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
  const tableRows = [];

  const displays = await Displays.getDisplays();
  const actions = await combine2(Promise.resolve(configuredActions), Promise.resolve(displays), matchActionsToDisplay);
  const actionsWithDisplay = filterWithDisplay(actions);
  const actionsWithoutDisplay = actions.filter((a) => (!(a instanceof ActionWithDisplay)));

  for (const display of displays) {
    const displayRow = document.createElement('tr');
    tableRows.push(displayRow);

    const cols = new Array(8).fill(0).map(() => document.createElement('td'));
    displayRow.replaceChildren(...cols);

    cols[0].replaceChildren(document.createTextNode(display.name));
    cols[1].replaceChildren(document.createTextNode(display.id.toString()));
    cols[2].replaceChildren(document.createTextNode(display.isPrimary.toString()));
    cols[3].replaceChildren(document.createTextNode(display.isInternal.toString()));
    cols[4].replaceChildren(document.createTextNode(display.resolution));
    cols[5].replaceChildren(document.createTextNode(`${display.bounds.width}x${display.bounds.height}`));
    cols[6].replaceChildren(document.createTextNode(JSON.stringify(display.bounds, null, 2)));
    cols[7].replaceChildren(...actionsWithDisplay.filter((a) => a.matchedDisplay.id === display.id).map((action) => createTableChip(action.id)));
  }

  const missingDisplays = new Set(actionsWithoutDisplay.map((a) => a.display));

  for (const missingDisplay of missingDisplays) {
    const displayRow = document.createElement('tr');
    displayRow.classList.add('warning');
    tableRows.push(displayRow);

    const cols = new Array(3).fill(0).map(() => document.createElement('td'));
    displayRow.replaceChildren(...cols);

    cols[0].replaceChildren(document.createTextNode(missingDisplay));
    cols[0].colSpan = 2;
    cols[1].replaceChildren(document.createTextNode(
        `Display '${missingDisplay}' is referred by some of the actions but it doesn't exist (this is normal if the display is not currently connected).`,
    ));
    cols[1].colSpan = 5;
    cols[2].replaceChildren(...actionsWithoutDisplay.filter((action) => action.display === missingDisplay).map((action) => createTableChip(action.id)));
  }

  checkNonUndefined(document.getElementById('displaysTable')).replaceChildren(...tableRows);
}

/**
 * @param {Action[]} actionsObj
 * @param {Matcher[]} matchersObj
 * @param {Map<string, any>} matchersWithInvalidActionsMap
 * @return {Promise<void>}
 */
async function showActions(actionsObj, matchersObj, matchersWithInvalidActionsMap) {
  const tableRows = [];

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
    const displayRow = document.createElement('tr');
    displayRow.classList.add('error');
    tableRows.push(displayRow);

    const cols = new Array(4).fill(0).map(() => document.createElement('td'));
    displayRow.replaceChildren(...cols);

    cols[0].replaceChildren(document.createTextNode(actionId));
    cols[1].replaceChildren(document.createTextNode('invalid'));
    cols[1].colSpan = 3;
    cols[2].replaceChildren(...(matchers.map((matcher) => createMatcherDiv(matcher))));
    cols[3].replaceChildren(document.createTextNode('invalid'));
    cols[3].colSpan = 2;
  }


  for (const action of actions) {
    const displayRow = document.createElement('tr');
    tableRows.push(displayRow);

    const cols = new Array(7).fill(0).map(() => document.createElement('td'));
    displayRow.replaceChildren(...cols);

    cols[0].replaceChildren(document.createTextNode(action.id));
    cols[1].replaceChildren(document.createTextNode(action.display));
    cols[2].replaceChildren(document.createTextNode(action instanceof ActionWithDisplay ? action.matchedDisplay.name : 'not connected'));
    if (action instanceof ActionWithDisplay) {
      cols[2].removeAttribute('class');
    } else {
      cols[2].classList.add('warning');
    }
    cols[3].replaceChildren(createPositionsElement(action));

    const filteredMatchers = matchers.filter((m) => m.actions.some((a) => a === action.id))
        .map((m) => createMatcherDiv(m, m instanceof MatcherWithAction && m.matchedAction.id === action.id));
    cols[4].replaceChildren(...filteredMatchers);
    cols[5].replaceChildren(document.createTextNode(action.menuName || ''));

    const mappedShortcut = shortcutsMap.get(action.shortcutId);
    cols[6].replaceChildren(document.createTextNode(
      action.shortcutId ? `${mappedShortcut || 'not set'} [${action.shortcutId}]` : ''));
    if (action.shortcutId && !mappedShortcut) {
      cols[6].classList.add('warning');
    } else {
      cols[6].removeAttribute('class');
    }
  }

  checkNonUndefined(document.getElementById('actionsTable')).replaceChildren(...tableRows);
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
 * @param {Action} action
 * @return {HTMLElement}
 */
function createPositionsElement(action) {
  const table = document.createElement('table');
  const tr1 = document.createElement('tr');
  const tr2 = document.createElement('tr');

  const td12 = document.createElement('td');
  td12.textContent = `${action.column.start} 🡒 ${action.column.end}`;

  const td21 = document.createElement('td');
  td21.innerHTML = `${action.row.start}<br>🡓<br>${action.row.end}`;

  tr1.replaceChildren(document.createElement('td'), td12);
  tr2.replaceChildren(td21, document.createElement('td'));
  table.replaceChildren(tr1, tr2);
  table.classList.add('positionsTable');
  return table;
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
/** @type {StandaloneJsonEditor.JSONEditor} */
let actionsEditor;
/** @type {StandaloneJsonEditor.JSONEditor} */
let matchersEditor;
/** @type {StandaloneJsonEditor.JSONEditor} */
let settingsEditor;

/**
 * @typedef {import('ajv').default} Ajv
 * @typedef {import('vanilla-jsoneditor/standalone.js').Validator} Validator
 */

/**
 * Returns a JSONEditor schema validator wrapping a precomiled AJV Schema
 * validator.
 *
 * This is a hack around the JsonEditor's lack of support for precompiled
 * schema validators. It only supports on-demand compiled validators, and these
 * cannot be used because chrome extensions do not support eval()
 *
 * This function creates a stub replacement for the Ajv instance created by the
 * JsonEditor, providing the minimum required properties which include a
 * compile() function that returns the precompiled AJV validator.
 *
 * This stub is then returned from an onCreateAjv function passed as an option
 * to JSONEditor's {@link StandaloneJsonEditor.createAjvValidator}.
 *
 * The JSONEditor {@link StandaloneJsonEditor.createAjvValidator} function is still required because
 * it enhances the errors returned by the AJV validator function
 *
 * @see https://github.com/josdejong/svelte-jsoneditor/blob/main/src/lib/plugins/validator/createAjvValidator.ts#L46
 *
 * @param {Function} validateFunction AJV schema validator.
 * @return {Validator} JSONEditor wrapped schema validator.
 */
function createAjvValidatorForPrecompiled(validateFunction) {
  // Create a stub Ajv instance providing the minimum required properties
  // needed by the JSONEditor.
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

  return StandaloneJsonEditor.createAjvValidator(
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
 * @return {StandaloneJsonEditor.JSONEditor}
 */
function createJSONEditorForElement(elementId, initialValue, precompiledValidator) {
  return new StandaloneJsonEditor.JSONEditor({
    target: checkNonUndefined(document.getElementById(elementId)),
    props: {
      content: {json: initialValue},
      mode: StandaloneJsonEditor.Mode.text,
      navigationBar: false,
      validator: createAjvValidatorForPrecompiled(precompiledValidator),
    },
  });
}

/**
 * @param {StandaloneJsonEditor.JSONEditor} editor
 * @return {String}
 */
function getJsonTextFromEditor(editor) {
  const content = editor.get();

  // content can contain either text or json properties, depending
  // on whether the text is valid JSON or where the user
  // is in the JSONEditor UI.
  if ('text' in content && content.text != null) {
    return content.text;
  } if ('json' in content && content.json != null) {
    return JSON.stringify(content.json);
  } else {
    throw new Error('unexpected content from json Editor: '+JSON.stringify(content));
  }
}


// ######################################################
// #                 Event Handlers                     #
// ######################################################

/**
 * Loads the config, and sets up editors.
 *
 * @return {Promise<void>}
 */
function onPageLoad() {
  actionsEditor= createJSONEditorForElement('actionsInput', [], schemaValidator.actions);
  matchersEditor = createJSONEditorForElement('matchersInput', [], schemaValidator.matchers);
  settingsEditor = createJSONEditorForElement('settingsInput', {}, schemaValidator.settings);

  return Storage.getRawConfiguration().then((config) => {
    actionsEditor.set({text: config.actions});
    matchersEditor.set({text: config.matchers});
    settingsEditor.set({text: config.settings});
    // Make editors visible.
    [...document.getElementsByClassName('jsonEditor')].forEach(
        (/** @type {HTMLElement} */ e) => e.style.display='');
    // Remove "Loading" messages.
    [...document.getElementsByClassName('loading')].forEach(
        (/** @type {HTMLElement} */ e) => e.style.display='none');
  })
      .then(() => validateEverything())
      .then(() => undefined);
}


/** @return {Promise<void>} */
function onDisplayChanged() {
  const validatedConfig = validateJson();
  return showDisplays(validatedConfig.actions);
}


/** @return {Promise<void>} */
function onSaveClick() {
  return validateEverything()
      .then((validatedConfig) => Storage.save(validatedConfig))
      .then(() => setStatus('Options saved'))
      .then(() => undefined)
      .catch((e) => setStatus(e.message));
}

/**
 * Perform validation
 * @return {Promise<void>}
 */
function onValidateClick() {
  return validateEverything().then(() => undefined);
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
document.addEventListener('keydown', onKeyDown);
checkNonUndefined(document.getElementById('save')).addEventListener('click', onSaveClick);
checkNonUndefined(document.getElementById('validate')).addEventListener('click', onValidateClick);

chrome.system.display.onDisplayChanged.addListener(onDisplayChanged);
