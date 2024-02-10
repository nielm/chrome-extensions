/**
 * @typedef {Object} StrippedDisplay
 * @property {string} id
 * @property {string} name
 * @property {boolean} isPrimary
 * @property {boolean} isInternal
 */

/** Display class */
export class Display {
  /** @type {string} */
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

  /**
   * @param {chrome.system.display.DisplayInfo} display
   */
  constructor(display) {
    this.id = display.id;
    this.name = display.name,
    this.isPrimary = display.isPrimary,
    this.isInternal = display.isInternal;
    this.bounds = display.bounds;
    this.workArea = display.workArea;

    const nativeMode = display.modes.find((m) => m.isNative);
    this.resolution = `${nativeMode?.width}x${nativeMode?.height}`;
  }

  /**
   * @param {string} displayName
   * @return {boolean}
   */
  matches(displayName) {
    switch (displayName) {
      case 'primary':
        return !!this.isPrimary;
      case '-primary':
        return !this.isPrimary;
      case 'internal':
        return !!this.isInternal;
      case '-internal':
        return !this.isInternal;
      default:
        return this.name === displayName ||
          this.id == displayName || // note this is a number == string comparison
          this.resolution === displayName;
    }
  }
}

/** Displays class */
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
   * Note: this method should be called in a single onDisplayChanged handler as it updates data
   *       in the chrome session storage.
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
   * Returns list of attached displays sorted from the top left to bottom right.
   *
   * @return {Promise<Display[]>}
   */
  static getDisplays() {
    return chrome.system.display.getInfo({})
        .then((displays) => (displays.map((d) => new Display(d))))
        .then((displays) => displays.sort((d1, d2) => d1.bounds.top - d2.bounds.top).sort((d1, d2) => d1.bounds.left - d2.bounds.left));
  }

  /**
   * Will find the display of the given name in a displays array.
   * It requires the entire displays array as displays might be
   * referenced with an index.
   *
   * @param {Display[]} displays
   * @param {string} displayName
   * @return {Display|undefined}
   */
  static #matchDisplay(displays, displayName) {
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

    return displays.filter((d) => d.matches(prefixDisplayName)).at(displayIndex);
  }

  /**
   * Will prepare a map of each display id to a matched display.
   *
   * @param {Display[]} displays
   * @param {Set<string>} referencedDisplayIds
   * @return {Map<string, Display|undefined>}
   */
  static mapDisplays(displays, referencedDisplayIds) {
    return new Map([...referencedDisplayIds].map(
        (referencedDisplayId) => [referencedDisplayId, Displays.#matchDisplay(displays, referencedDisplayId)]));
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
