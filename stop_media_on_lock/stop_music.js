var script = document.createElement('script');

script.setAttribute('src', chrome.runtime.getURL('stop_music_worker.js'));

(document.head || document.documentElement).appendChild(script);

script.parentNode.removeChild(script);
