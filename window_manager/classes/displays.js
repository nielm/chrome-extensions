export class Displays {
  static async init() {
    console.group(`${new Date().toLocaleTimeString()} Displays: init`);
    const currentDisplays = await Displays.#getSavedDisplays();
    console.log(`${new Date().toLocaleTimeString()} Init:   ${JSON.stringify(currentDisplays)}`);
    console.groupEnd();
  }

  // Returns true if the displays were changed since the last check.
  static async displaysChanged() {
    const currentDisplaysPromise = Displays.#getCurrentDisplays();
    const savedDisplays = await Displays.#getSavedDisplays();
    const currentDisplays = await currentDisplaysPromise;

    const savedDisplaysStripped = savedDisplays.map((display) => Displays.#mapImportantFields(display));
    const currentDisplaysStripped = currentDisplays.map((display) => Displays.#mapImportantFields(display));

    if (JSON.stringify(savedDisplaysStripped) != JSON.stringify(currentDisplaysStripped)) {
      console.log(`${new Date().toLocaleTimeString()} Displays.displaysChanged:true - important fields were changed`);
      await Displays.#setSavedDisplays(currentDisplays);
      return true;
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
      await Displays.#setSavedDisplays(currentDisplays);
      return true;
    }
  }


  // Returns saved displays from the storage.
  // When storage is empty defaultValue displays will be saved and returned
  // When defaultValue is not provided current displays will be used.
  static async #getSavedDisplays(defaultValue = undefined) {
    const savedDisplays = await chrome.storage.session.get({displayData: ''})
        .then((item) => item.displayData);
    console.log(`${new Date().toLocaleTimeString()} Loaded: ${JSON.stringify(savedDisplays || '<null>')}`);
    return savedDisplays || await Displays.#setSavedDisplays(defaultValue || await Displays.#getCurrentDisplays());
  }

  // Saves current or provided displays to the storage
  static async #setSavedDisplays(displays) {
    await chrome.storage.session.set({displayData: displays});
    console.log(`${new Date().toLocaleTimeString()} Saved:  ${JSON.stringify(displays)}`);
    return displays;
  }

  static #getCurrentDisplays() {
    return chrome.system.display.getInfo({})
        .then((displays) =>
          (displays.map((display) => {
            const strippedDisplay = Displays.#mapImportantFields(display);
            strippedDisplay.bounds = display.bounds;
            strippedDisplay.workArea = display.workArea;
            return strippedDisplay;
          },
          )));
  }

  // Returns display fields that identifies monitors
  static #mapImportantFields(display) {
    return {
      // return all the properties that we use to arrange windows
      id: display.id,
      name: display.name,
      isPrimary: display.isPrimary,
      isInternal: display.isInternal,
    };
  }

  static #areDisplaySizesEqual(d1, d2) {
    return d1.height == d2.height &&
      d1.left == d2.left &&
      d1.top == d2.top &&
      d1.width == d2.width;
  }
}
