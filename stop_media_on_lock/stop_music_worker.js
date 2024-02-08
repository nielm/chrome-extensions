/**
 * @typedef {Object} PausableElement
 * @property {function} pause
 */

/**
 * @param {string} event
 * @param {string} code
 * @param {string} key
 * @param {number} keyCode
 * @return {KeyboardEvent}
 */
function createKeyEvent(event, code, key, keyCode) {
  return new KeyboardEvent(event,
      {altKey: false,
        bubbles: true,
        // cancelBubble: false,
        cancelable: true,
        code: code,
        composed: true,
        // isTrusted: true,
        // defaultPrevented: true,
        charCode: 0,
        shiftKey: false,
        key: key,
        keyCode: keyCode,
        location: 0,
        metaKey: false});
}

/**
 * @param {string} code
 * @param {string} key
 * @param {number} keyCode
 * @return {void}
 */
function sendKey(code, key, keyCode) {
  document.dispatchEvent(createKeyEvent('keydown', code, key, keyCode));
  document.dispatchEvent(createKeyEvent('keypress', code, key, keyCode));
  document.dispatchEvent(createKeyEvent('keyup', code, key, keyCode));
}

/**
 * Make ts compiler checks happy.
 *
 * @param {Object} el
 * @return {PausableElement}
 */
function asMedia(el) {
  return el;
}

const audioVideo = Array.from(document.querySelectorAll('video, audio'));

if (audioVideo.length) {
  audioVideo.forEach((media) => asMedia(media).pause());
} else {
  // Space is universal play pause button - let's simulate kkey event.
  sendKey('Spacebar', ' ', 32);
}
