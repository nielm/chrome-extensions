import {Display, Displays} from './displays.js';
import {Position} from './position.js';
import {checkNonEmpty} from '../utils/preconditions.js';
import {validateClass} from '../utils/validation.js';


/**
 * Object as defined here:
 * https://developer.chrome.com/docs/extensions/reference/api/windows#parameters_6
 *
 * @typedef {Object} WindowsUpdate
 * @property {number=} left
 * @property {number=} top
 * @property {number=} width
 * @property {number=} height
 * @property {chrome.windows.windowStateEnum} state
 * @property {boolean} focused
 */

/**
 * Will convert Action to ActionWithDisplay based on the displays list.
 * The output list will have the same size as an input list, if the display
 * is not found the same Action will be returned.
 *
 * @param {Action[]} actions
 * @param {Display[]} displays
 * @return {(ActionWithDisplay | Action)[]}
 */
export function matchActionsToDisplay(actions, displays) {
  const referencedDisplayIds = new Set(actions.map((a) => a.display));
  const displaysMap = Displays.mapDisplays(displays, referencedDisplayIds);

  return actions.map((a) => (displaysMap.get(a.display) ? new ActionWithDisplay(checkNonEmpty(displaysMap.get(a.display), 'This is bug in the action.js code'), a) : a));
}

/**
 * @param {(ActionWithDisplay | Action)[]} actions
 * @return {ActionWithDisplay[]}
 */
export function filterWithDisplay(actions) {
  // eslint-disable-next-line valid-jsdoc, jsdoc/no-undefined-types
  return actions.filter(/** @return {a is ActionWithDisplay} */ (a) => a instanceof ActionWithDisplay);
}

/** Action class */
export class Action {
  /** @type {string} */
  comment;

  /**
   * Identifier of the action. It used in matchers.
   * @type {string}
   */
  id;

  /**
   * id of the display, action will not be performed if display doesn't exist
   * see findDisplayByName for details
   * @type {string}
   */
  display;

  /** @type {string} */
  menuName;

  /** @type {number} */
  shortcutId;

  /** @type {Position} */
  column;

  /** @type {Position} */
  row;

  /** @return {void} */
  validate() {
    validateClass(new Action(), this, ['menuName', 'shortcutId', 'comment']);
    this.column?.validate();
    this.row?.validate();
  }

  /**
   * Creates object from json string without validation.
   *
   * @param {*} json
   * @return {Action}
   */
  static from(json) {
    if (json.column) {
      json.column = Object.assign(new Position(), json.column);
    }
    if (json.row) {
      json.row = Object.assign(new Position(), json.row);
    }
    return Object.assign(new Action(), json);
  }
}

/** ActionWithDisplay class */
export class ActionWithDisplay extends Action {
  /** @type {Display} */
  matchedDisplay;

  /**
   * @param {Display} matchedDisplay
   * @param {Action} action
   */
  constructor(matchedDisplay, action) {
    super();
    Object.assign(this, action);
    this.matchedDisplay = matchedDisplay;
  }

  /**
   * @return {WindowsUpdate}
   */
  prepareUpdate() {
    const display = this.matchedDisplay;

    /** @type {WindowsUpdate} */
    const windowsUpdate = {
      state: 'normal',
      focused: true,
    };
    if (this.column) {
      const column = this.column.calculate(display.workArea.width);
      if (column.start != undefined) {
        windowsUpdate.left = display.workArea.left + column.start;
        if (column.end != undefined) {
          windowsUpdate.width = column.end - column.start;
        }
      }
    } else {
      console.debug(`action.id=${this.id} column not defined`);
    }
    if (this.row) {
      const row = this.row.calculate(display.workArea.height);
      if (row.start != undefined) {
        windowsUpdate.top = display.workArea.top + row.start;
        if (row.end != undefined) {
          windowsUpdate.height = row.end - row.start;
        }
      }
    } else {
      console.debug(`action.id=${this.id} row not defined`);
    }

    return windowsUpdate;
  }
}
