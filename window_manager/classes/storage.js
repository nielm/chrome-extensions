export class Storage {
  static #instance;

  constructor() {
    // Checking if the instance already exists
    if (Storage.#instance) {
      return Storage.#instance;
    }
    Storage.#instance = this;
    console.log('Storage instance created');
  }

  saveAll(actions, matchers, settings) {
  }
}
