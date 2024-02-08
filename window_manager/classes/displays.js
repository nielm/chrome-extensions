/**
 * @typedef {Object} StrippedDisplay
 * @property {number} id
 * @property {string} name
 * @property {boolean} isPrimary
 * @property {boolean} isInternal
 */

export class Display {
  /** @type {number} */
  id;

  /** @type {string} */
  name;

  /** @type {boolean} */
  isPrimary;

  /** @type {boolean} */
  isInternal;

  /** @type {chrome.system.display.Bounds} */
  bounds;

  /** @type {chrome.system.display.Bounds} */
  workArea;

  /** @type {string} */
  resolution;

  constructor(display) {
    this.id = display.id;
    this.name = display.name,
    this.isPrimary = display.isPrimary,
    this.isInternal = display.isInternal;
    this.bounds = display.bounds;
    this.workArea = display.workArea;

    const nativeMode = display.modes.find((m) => m.isNative);
    this.resolution = `${nativeMode.width}x${nativeMode.height}`;
  }
}

export class Displays {
  /**
   * @return {Promise<void>}
   */
  static async init() {
    console.group(`${new Date().toLocaleTimeString()} Displays: init`);
    const currentDisplays = await Displays.#getSavedDisplays();
    console.log(`${new Date().toLocaleTimeString()} Init:   ${JSON.stringify(currentDisplays)}`);
    console.groupEnd();
  }

  /**
   * Returns true if the displays were changed since the last check.
   *
   * @return {Promise<boolean>}
   */
  static async displaysChanged() {
    const currentDisplaysPromise = Displays.getDisplays();
    const savedDisplays = await Displays.#getSavedDisplays();
    const currentDisplays = await currentDisplaysPromise;

    const savedDisplaysStripped = savedDisplays.map((display) => Displays.#mapImportantFields(display));
    const currentDisplaysStripped = currentDisplays.map((display) => Displays.#mapImportantFields(display));

    if (JSON.stringify(savedDisplaysStripped) != JSON.stringify(currentDisplaysStripped)) {
      console.log(`${new Date().toLocaleTimeString()} Displays.displaysChanged:true - important fields were changed`);
      return Displays.#setSavedDisplays(currentDisplays).then(() => true);
    }

    // At this point we know that ids, names and primary/internal assignments has not changed.
    // Let's check displays' dimensions
    const savedDisplaysSize = savedDisplays.map((display) => ({bounds: display.bounds, workArea: display.workArea}));
    const currentDisplaysSize = currentDisplays.map((display) => ({bounds: display.bounds, workArea: display.workArea}));

    if (JSON.stringify(savedDisplaysSize) == JSON.stringify(currentDisplaysSize)) {
      console.log(`${new Date().toLocaleTimeString()} Displays.displaysChanged:false - important fields and work areas not changed`);
      return false;
    }

    // At this point we know that ids, names and primary/internal assignments has not changed
    // but displays' dimensions were changed. The following events might have happened:
    // 1. screen is locked
    //    (shelf is being hidden - work area is changed to the same value as bounds)
    // 2. any window is set to full screen
    //    (shelf is being hidden - work area is changed to the same value as bounds)
    // 3. shelf position is changed
    //    (bounds value is not changed, work area is changed)
    //
    // Rearranging windows should only occur at 3.
    // Let's compare workArea and bounds of each display - 3. will only happen when workArea != bounds.
    // Note: this will not work for configurations when shelf has "autohide" configuration, but I didn't
    // find any better way of detecting it.

    if (currentDisplaysSize.some((display) => Displays.#areDisplaySizesEqual(display.bounds, display.workArea))) {
      console.log(`${new Date().toLocaleTimeString()} Displays.displaysChanged:false - at least one display has workArea == bounds`);
      return false;
    } else {
      console.log(`${new Date().toLocaleTimeString()} Displays.displaysChanged:true - all displays has workArea != bounds`);
      return Displays.#setSavedDisplays(currentDisplays).then(() => true);
    }
  }

  /**
   * Returns list of attached displays.
   *
   * @return {Promise<Display[]>}
   */
  static async getDisplays() {
    return chrome.system.display.getInfo({}).then((displays) => (displays.map((d) => new Display(d))));
  }

  /**
   * Returns saved displays from the storage.
   * When storage is empty defaultValue displays will be saved and returned
   * When defaultValue is not provided current displays will be used.
   *
   * @param {*} defaultValue
   * @return {Promise<Display[]>}
   */
  static async #getSavedDisplays(defaultValue = undefined) {
    const savedDisplays = await chrome.storage.session.get({displayData: ''})
        .then((item) => item.displayData);
    console.log(`${new Date().toLocaleTimeString()} Loaded: ${JSON.stringify(savedDisplays || '<null>')}`);
    return savedDisplays || await Displays.#setSavedDisplays(defaultValue || await Displays.getDisplays());
  }

  /**
   * Saves current or provided displays to the storage
   *
   * @param {Display[]} displays
   * @return {Promise<Display[]>}
   */
  static async #setSavedDisplays(displays) {
    await chrome.storage.session.set({displayData: displays});
    console.log(`${new Date().toLocaleTimeString()} Saved:  ${JSON.stringify(displays)}`);
    return displays;
  }

  /**
   * Returns display fields that identifies monitors
   *
   * @param {Display} display
   * @return {StrippedDisplay}
   */
  static #mapImportantFields(display) {
    return {
      id: display.id,
      name: display.name,
      isPrimary: display.isPrimary,
      isInternal: display.isInternal,
    };
  }

  /**
   * @param {chrome.system.display.Bounds} d1
   * @param {chrome.system.display.Bounds} d2
   * @return {boolean}
   */
  static #areDisplaySizesEqual(d1, d2) {
    return d1.height == d2.height &&
      d1.left == d2.left &&
      d1.top == d2.top &&
      d1.width == d2.width;
  }
}
