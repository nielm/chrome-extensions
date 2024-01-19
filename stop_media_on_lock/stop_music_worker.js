function createKeyEvent(event, code, key, keyCode) {
  return new KeyboardEvent(event,
      {altKey: false,
        bubbles: true,
        cancelBubble: false,
        cancelable: true,
        code: code,
        composed: true,
        isTrusted: true,
        defaultPrevented: true,
        charCode: 0,
        shiftKey: false,
        key: key,
        keyCode: keyCode,
        location: 0,
        metaKey: false});
}


function sendKey(code, key, keyCode) {
  document.dispatchEvent(createKeyEvent('keydown', code, key, keyCode));
  document.dispatchEvent(createKeyEvent('keypress', code, key, keyCode));
  document.dispatchEvent(createKeyEvent('keyup', code, key, keyCode));
}

const audioVideo = Array.from(document.querySelectorAll('video, audio'));

if (audioVideo.length) {
  audioVideo.forEach((media) => media.pause());
} else {
  // Space is universal play pause button - let's simulate kkey event.
  sendKey('Spacebar', ' ', 32);
}
