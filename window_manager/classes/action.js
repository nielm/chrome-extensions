import {Position} from './position.js';

export class Action {
  column;
  row;
  // identifier of the action. It used in matchers.
  id;
  // id of the display, action will not be performed if display doesn't exist
  display;
  // top and left position of the display on the desktop
  displayPosition;
  menuName;
  shortcutId;

  static loadAll() {
    return chrome.storage.sync.get({actions: ''})
      .then(items => items.actions)
      .then(actions => (actions
                        ? JSON.parse(actions).map(a => Action.from(a))
                        : []));
  }

  static from(json) {
    if (!json.id) {
      console.error(json);
      throw new Error('action id not defined');
    }
    if (!json.display) {
      console.error(json);
      throw new Error('display not defined');
    }
    if (json.column) {
      json.column = Object.assign(new Position(), json.column);
    }
    if (json.row) {
      json.row = Object.assign(new Position(), json.row);
    }
    return Object.assign(new Action(), json);
  }

  /**
   * @param {Array<chrome.system.display>} displays
   * @returns {Array<chrome.system.display>} filtered list of displays
   */
  findDisplay(displays) {
    displays = this.filterByName(displays);
    displays = this.filterByDisplayPosition(displays);
    if(displays.length > 0) {
      return displays[0];
    }
    return null;
  }

  /**
   * @param {Array<chrome.system.display>} displays
   * @returns {Array<chrome.system.display>} filtered list of displays
   */
  filterByName(displays) {
    return displays.filter((d) => {
      switch(this.display) {
        case 'primary':
          return d.isPrimary === true;
        case '-primary':
          return d.isPrimary === false;
        case 'internal':
          return d.isInternal === true;
        case '-internal':
          return d.isInternal === false;
        case '':
        case undefined:
        case null:
          return true; // matches any display.
        default:
          return d.name === this.display;
      }
    });
  }

  /**
   * @param {Array<chrome.system.display>} displays
   * @returns {Array<chrome.system.display>} filtered list of displays
   */
  filterByDisplayPosition(displays) {
    return displays.filter((d) => {
      if(this.displayPosition?.top != null &&
        this.displayPosition.top !== d.bounds.top) {
          return false;
      }
      if(this.displayPosition?.left != null &&
        this.displayPosition.left !== d.bounds.left) {
          return false;
      }
      return true;
    });
  }


  createUpdate(displays) {
    const display = this.findDisplay(displays);
    if (!display) {
      console.debug(`Display ${this.display} not found`);
      return {};
    }

    const windowsUpdate = {
      state: 'normal',
      focused: true
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
