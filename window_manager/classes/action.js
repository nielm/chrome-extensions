import {Display} from './displays.js';
import {Position} from './position.js';
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

  /**
   * Finds the display for this action among the given displays
   *
   * @param {Display[]} displays
   * @return {?Display}
   */
  findDisplay(displays) {
    return Action.findDisplayByName(this.display, displays);
  }

  /**
   * Finds a display among the given displays by name
   *
   * @param {string} displayName
   * @param {Display[]} displays
   * @return {?Display}
   */
  static findDisplayByName(displayName, displays) {
    let prefixDisplayName=displayName;
    let displayIndex = 0;
    // look for a [N] suffix, and split display name into prefix and suffix

    /* regex:
      ^         start string
      (.*?)     group $1 - the smallest possible char sequence - the display name
      \[        literal '['
      ([0-9]+)  group $2 - sequnce of 1 or more numbers -- the display index
      \]        literal ']'
      $         end of string.
    */

    const matcher = displayName.match(/^(.*?)\[([0-9]+)\]$/);
    if (matcher) {
      prefixDisplayName = matcher[1];
      displayIndex = parseInt(matcher[2]);
    }

    let filter;
    switch (prefixDisplayName) {
      case 'primary':
        filter = (d) => !!d.isPrimary;
        break;
      case '-primary':
        filter = (d) => !d.isPrimary;
        break;
      case 'internal':
        filter = (d) => !!d.isInternal;
        break;
      case '-internal':
        filter = (d) => !d.isInternal;
        break;
      default:
        filter = (d) => (
          d.name === prefixDisplayName ||
          d.id == prefixDisplayName || // note this is a number == string comparison
          d.resolution === prefixDisplayName
        );
        break;
    }

    const matchedDisplays = displays.filter(filter);

    if (matchedDisplays.length === 0 || displayIndex >= matchedDisplays.length) {
      return null;
    } else {
      // Sort displays by position on desktop -> left to right, then top to bottom
      matchedDisplays.sort((d1, d2) => d1.bounds.top - d2.bounds.top);
      matchedDisplays.sort((d1, d2) => d1.bounds.left - d2.bounds.left);
      console.debug(`matched ${displayName} to `, matchedDisplays[displayIndex]);
      return matchedDisplays[displayIndex];
    }
  }


  /**
   * @param {Display[]} displays
   * @return {WindowsUpdate|null}
   */
  createUpdate(displays) {
    const display = this.findDisplay(displays);
    if (!display) {
      console.debug(`Display ${this.display} not found`);
      return null;
    }

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
