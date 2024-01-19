import {Position} from './position.js';

export class Action {
  column;
  row;
  // identifier of the action. It used in matchers.
  id;
  // id of the display, action will not be performed if display doesn't exist
  display;
  menuName;
  shortcutId;

  static loadAll() {
    return chrome.storage.sync.get({actions: '[]'})
        .then((items) => items.actions)
        .then((actions) => (actions ?
                        JSON.parse(actions).map((a) => Action.from(a)) :
                        []));
  }

  static from(json) {
    if (!json.id) {
      console.error(json);
      throw new Error('action id not defined');
    }
    if (!json.display) {
      console.error(json);
      throw new Error('display id not defined');
    }
    if (json.column) {
      json.column = Object.assign(new Position(), json.column);
    }
    if (json.row) {
      json.row = Object.assign(new Position(), json.row);
    }
    return Object.assign(new Action(), json);
  }

  findDisplay(displays) {
    switch (this.display) {
      case 'primary':
        return displays.find((display) => display.isPrimary === true);
      case '-primary':
        return displays.find((display) => display.isPrimary === false);
      case 'internal':
        return displays.find((display) => display.isInternal === true);
      case '-internal':
        return displays.find((display) => display.isInternal === false);
      default:
        // Match by display Name or display ID
        return displays.find((display) => (
          display.name === this.display ||
            display.id == this.display // note this is a number == string comparison
        ));
    }
  }

  createUpdate(displays) {
    const display = this.findDisplay(displays);
    if (!display) {
      console.debug(`Display ${this.display} not found`);
      return null;
    }

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
