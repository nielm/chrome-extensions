import {validateClass} from '../utils/validation.js';


/** Settings class */
export class Settings {
  /** @type {string} */
  popupButtonColor = 'f9f9f9';

  /** @type {string} */
  popupBackgroundColor = 'white';

  /** @type {boolean} */
  triggerOnMonitorChange = false;

  /** @type {boolean} */
  triggerOnWindowCreated = false;

  /** @return {void} */
  validate() {
    validateClass(new Settings(), this, ['popupButtonColor', 'popupBackgroundColor', 'triggerOnMonitorChange', 'triggerOnWindowCreated']);
  }


  /**
   * Creates object from json string without validation.
   *
   * @param {*} json
   * @return {Settings}
   */
  static from(json) {
    return Object.assign(new Settings(), json);
  }
}
