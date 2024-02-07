import {Settings} from './settings.js';

export class Position {
  // Start defined as pixel value or percentage of screen
  start = 0;
  // End defined as pixel value or percentage of screen
  end = '100%';

  /**
   * @param {*} json
   * @return {Position}
   */
  static from(json) {
    return Object.assign(new Position(), json);
  }

  /**
   * @param {*} json
   * @return {void}
   */
  static validate(json) {
    Settings.validateClass(new Position(), json, ['comment']);
  }

  // size: amount of pixels that can be used:
  //   - returned start and end are guarantted to be in [0, size] range
  //   - size is used to calculate percentages
  calculate(size) {
    let start = this.maybeValuePercent(this.start, size);
    let end = this.maybeValuePercent(this.end, size);

    if (isNaN(start)) {
      start = this.getValueNumber(this.start, size);
    }
    if (isNaN(end)) {
      end = this.getValueNumber(this.end, size);
    }

    return {start, end};
  }

  // Will return percentage value multiplied by size or undefined if not a percent.
  // Note: not using "null" as isNaN(null) == false
  maybeValuePercent(value, size) {
    if (typeof value !== 'string') {
      return undefined;
    }
    if (value.charAt(value.length - 1) !== '%') {
      throw new Error(`Invalid value: ${value} - expected percent.`);
    }
    // using parseFloat as it ignores invalid characters ('%' at the end)
    const percent = parseFloat(value);
    if (percent < 0 || percent > 100) {
      throw new Error(`Expected percentage 0-100, actual: ${percent}`);
    }
    return Math.floor(size * percent / 100);
  }

  getValueNumber(value, size) {
    if (typeof value !== 'number') {
      throw new Error(`Value ${value} should be string or a number.`);
    }
    // treat negative values as calculated from the end.
    return value < 0 ?
      Math.max(0, size + value) :
      Math.min(size, value);
  }
}
