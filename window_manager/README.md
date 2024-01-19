## Extension

The extension is automatically arranging chrome windows, according to the predefined rules stored as JSON configuration. This extension was created and tested on Chrome OS. It should work on other operating systems but will not be able to organize windows that don't belong to the chrome browser.

This page describes options that are available on the options page (`chrome-extension://jjgebfkefchhekbmckeheacgbiicpmim/options.html`) of the extension.

## Actions

Action defines how the window should be moved and resized. Following fields are supported:

- `id` - **required**, identifier of the action, used in matchers to reference the action

- `display` - **required**, name of display, the action will not be performed if the display of given name doesn't exist.

  Available values:
  - `primary` - display defined as primary
  - `-primary` - display that is not primary (if there are multiple non primary displays the first one will be used)
  - `internal` - display defined as internal
  - `-internal` - display that is not internal (if there are multiple non internal displays the first one will be used)
  - `[name of the display]` - name of the display, e.g. `DELL U4021QW`.
  - `[id of the display]` - ChromeOS internal display ID (useful when you have multiple displays with the same name)

  _Hint: A List of displays with their names and IDs is printed at the top of the extension options page._

- `shortcutId` - action will be triggered by the shortcut of given id as defined on the shortcuts page (`chrome://extensions/shortcuts`).

  _Hint: The same shortcutId can be used for multiple actions - after pressing shortcut all actions will be applied to matched window. This is also useful for different displays - the same shortcutId can trigger different action on different displays._

  _This extension registered 9 shortcuts with an ids from `1` to `9`. Please define the shortcut on the shortcuts page._

- `column` - definition of column

- `row `- definition of row

- `menuName` - if set, the action will be shown in the popup menu of extension

  _Hint: you can use unicode characters in the menu name._

The `row` and `column` objects are defined using `start` and `end` fields. Following values of `start` and `end` are allowed:
- `percentage value` defined as string (between `"0%"` and `"100%"`) - window will be set at percentage position of the screen
- `number` - window will be set at the pixel position, counting from the top left
- `negative number` - window will be set at pixel position counting from the bottom right (using the absolute value)

The values are counted from the top left corner (top for the row definition and left for the column definition). On the hidpi displays they are the logical pixels that are defined after applying the scale.

### Example

```json
[
  {
    "id":         "column1",
    "display":    "-internal",
    "menuName":   "◼◻◻",
    "shortcutId": 3,
    "column":     {"start": 0, "end": "33.3%"},
    "row":        {"start": 0, "end": "100%"}
  },
  {
    "id":         "column2",
    "display":    "-internal",
    "menuName":   "◻◼◼",
    "column":     {"start": "33.3%", "end": "100%"},
    "row":        {"start": 0, "end": "100%"}
  }
]
```

The actions above are dividing the screen into 2 columns. The first one will occupy 1/3 of the screen and the second one will occupy the remaining 2/3.

Both actions will be performed only if non-internal monitor is connected. They also both specify menu names - after left clicking on the extension icon these actions will be available, the unicode characters of ◻ and ◼ are visualising how much screen is used by each action.

In addition to that the first action can be called by using keyboard shortcut number 3.

## Matchers

Matchers define which action should be applied on a matched window. Following fields are supported:

- `actions` - **required**, array of strings - action ids to perform on the window if matched.

  _Please remember that an action definition contains a display. The action will not be performed if display doesn't exist._

  Type of this field is array, so one matcher can be used with many actions, specified for different displays.

- `windowTypes` - array of window types to match as [defined here](https://developer.chrome.com/docs/extensions/reference/windows/#type-WindowType). Window will be matched if its type is in the array.

  _**Default**: any window type_

- `anyTabUrl` - url as string. The window will be matched if any of its tabs urls matches this string.

  _**Default**: any url_

- `minTabsNum` - number of tabs. Window will be matched when it has at least `minTabsNum` tabs opened.

  _**Default**: 0_

- `maxTabsNum` - number of tabs. Window will be matched when it has at most `maxTabsNum` tabs opened.

  _**Default**: 1'000'000'000_

The default values are specified in a way that an empty matcher will match any window. This can be used as a default action (e.g. to maximise every window by default).

In case of multiple matches they are processed in a matchers order (_Note that only values that are set are getting overwritten - it is possible that one action will set row values and another one will set columns_).

### Example

```json
[
  {
    "actions": ["column1"],
    "windowTypes": ["app", "popup"]
  },
  {
    "actions": ["column2"],
    "anyTabUrl": "//github.com/"
  }
]
```

In the example above:
- all the `app` and `popup` windows will be moved to the left 1/3 of the screen
- browser window with `github.com` tab opened will be moved to the right 2/3 of the screen
- popup window with `github.com` page will be moved to the right 2/3 as the matcher is defined later in the settings

## Settings

Since the extension requires JSON knowledge to define the actions and matchers, it is simpler to specify settings as JSON instead of preparing an UI for each parameter. The following settings are possible:

- `popupBackgroundColor` - string definition of color of the popup window background that is opened by the left click on the extension (e.g. `"white"`).
- `popupButtonColor` - string definition of color of the popup window buttons (e.g. `"#f9f9f9"`).
- `triggerOnMonitorChange` - boolean value - when true, the extension will rearrange all the windows when new monitors are connected or disconnected
- `triggerOnWindowCreated` - boolean value - when true, the extension will apply matchers to newly created windows


## FAQ

### How to use multiple displays with priority?
Actions are performed in an order of matchers. Let's assume you want to process `github.com` window:
- on the external display the window should occupy left half of the screen
- on the internal display it should occupy the entire screen
- when both screens are active (i.e. laptop screen is open and external display is connected) the external one should take precedence.

Let's define two actions first:
```json
[
  {
    "id": "internal-full-screen",
    "display": "internal",
    "column": {"start": 0, "end": "100%"},
    "row": {"start": 0, "end": "100%"}
  },
  {
    "id": "non-internal-half",
    "display": "-internal",
    "column": {"start": 0, "end": "50%"},
    "row": {"start": 0, "end": "100%"}
  }
]
```
The `internal-full-screen` entry will be only applied on `internal` display (if it exists, otherwise will be ignored) and will set the window size to occupy 100% of the screen. The `non-internal-half` entry will be only applied on non internal screen (defined as `-internal`, note that it will be applied to the first non internal screen, if you want to use a specific non internal screen, please use the name of that screen instead).

With the actions, let's define matchers for `github.com` window:

```json
[
  {
    "actions": ["internal-full-screen", "non-internal-half"],
    "anyTabUrl": "//github.com/"
  }
]
```

Matchers are processed in order of definition. If both internal and non internal monitors exist, the action that is defined later (`non-internal-half`) will be applied. If only an internal monitor exists, the `non-internal-half` action will not be performed as it requires `"display": "-internal"`.

## Examples

<details>
  <summary>Actions</summary>

```json
[
  {
    "comment": "Internal display has two overlapping columns - this is the one to the left.",
    "id": "internal-column1",
    "display": "internal",
    "column": {
      "start": 0,
      "end": "60%"
    },
    "row": {
      "start": 0,
      "end": "70%"
    }
  },
  {
    "comment": "Internal display has two overlapping columns - this is the one to the right.",
    "id": "internal-column2",
    "display": "internal",
    "column": {
      "start": "20%",
      "end": "100%"
    },
    "row": {
      "start": 0,
      "end": -30
    }
  },
  {
    "comment": "Three chat apps (whatsapp, messenger and sms) should be visible all the time - the 'x-3' rules are positioning these three windows in a way that the top left icon is always visible.",
    "id": "internal-1-3",
    "display": "internal",
    "column": {
      "start": 60,
      "end": "60%"
    },
    "row": {
      "start": 0,
      "end": "75%"
    }
  },
  {
    "comment": "Three chat apps (whatsapp, messenger and sms) should be visible all the time - the 'x-3' rules are positioning these three windows in a way that the top left icon is always visible.",
    "id": "internal-2-3",
    "display": "internal",
    "column": {
      "start": 30,
      "end": "60%"
    },
    "row": {
      "start": 40,
      "end": "75%"
    }
  },
  {
    "comment": "Three chat apps (whatsapp, messenger and sms) should be visible all the time - the 'x-3' rules are positioning these three windows in a way that the top left icon is always visible.",
    "id": "internal-3-3",
    "display": "internal",
    "column": {
      "start": 0,
      "end": "60%"
    },
    "row": {
      "start": 80,
      "end": "75%"
    }
  },
  {
    "id": "internal-music",
    "display": "internal",
    "column": {
      "start": 0,
      "end": "50%"
    },
    "row": {
      "start": 120,
      "end": -30
    }
  },
  {
    "comment": "Status bar on internal - uses the entire display width.",
    "id": "internal-status",
    "display": "internal",
    "column": {
      "start": 0,
      "end": "100%"
    },
    "row": {
      "start": -30,
      "end": "100%"
    }
  },
  {
    "id": "internal-calculator",
    "display": "internal",
    "column": {
      "start": 0,
      "end": 500
    },
    "row": {
      "start": -330,
      "end": -30
    }
  },
  {
    "comment": "External display is divided into 3 columns: 25%, 37.5% and 37.5%. Defining column 2 first as order is used in the popup menu and I want this one to be first.",
    "id": "column2",
    "shortcutId": 1,
    "menuName": "◻◼◻",
    "display": "-internal",
    "column": {
      "start": "25%",
      "end": "62.5%"
    },
    "row": {
      "start": 0,
      "end": "100%"
    }
  },
  {
    "comment": "External display is divided into 3 columns: 25%, 37.5% and 37.5%.",
    "id": "column3",
    "shortcutId": 2,
    "menuName": "◻◻◼",
    "display": "-internal",
    "column": {
      "start": "62.5%",
      "end": "100%"
    },
    "row": {
      "start": 0,
      "end": "100%"
    }
  },
  {
    "comment": "External display is divided into 3 columns: 25%, 37.5% and 37.5%. First column uses 75% of height only.",
    "id": "column1",
    "menuName": "◼◻◻",
    "display": "-internal",
    "column": {
      "start": 0,
      "end": "25%"
    },
    "row": {
      "start": 0,
      "end": "75%"
    }
  },
  {
    "comment": "Two columns that occupy 75% of the screen. Currently not used by any matcher but only as menu.",
    "id": "column2+3",
    "menuName": "◻◼◼",
    "display": "-internal",
    "column": {
      "start": "25%",
      "end": "100%"
    },
    "row": {
      "start": 0,
      "end": "100%"
    }
  },
  {
    "id": "IDE",
    "display": "-internal",
    "column": {
      "start": "20%",
      "end": "100%"
    },
    "row": {
      "start": 0,
      "end": -30
    }
  },
  {
    "comment": "This is for the desks where single chat app is visible - not need to use 'x-3' layout.",
    "id": "chat",
    "display": "-internal",
    "row": {
      "start": 0,
      "end": "50%"
    }
  },
  {
    "comment": "Three chat apps (whatsapp, messenger and sms) should be visible all the time - the 'x-3' rules are positioning these three windows in a way that the top left icon is always visible.",
    "id": "1-3",
    "display": "-internal",
    "column": {
      "start": 60,
      "end": "25%"
    },
    "row": {
      "start": 0,
      "end": "50%"
    }
  },
  {
    "comment": "Three chat apps (whatsapp, messenger and sms) should be visible all the time - the 'x-3' rules are positioning these three windows in a way that the top left icon is always visible.",
    "id": "2-3",
    "display": "-internal",
    "column": {
      "start": 30,
      "end": "25%"
    },
    "row": {
      "start": 40,
      "end": "50%"
    }
  },
  {
    "comment": "Three chat apps (whatsapp, messenger and sms) should be visible all the time - the 'x-3' rules are positioning these three windows in a way that the top left icon is always visible.",
    "id": "3-3",
    "display": "-internal",
    "column": {
      "start": 0,
      "end": "25%"
    },
    "row": {
      "start": 80,
      "end": "50%"
    }
  },
  {
    "id": "music",
    "display": "-internal",
    "column": {
      "start": 0,
      "end": "25%"
    },
    "row": {
      "start": "50%",
      "end": -30
    }
  },
  {
    "comment": "Status bar on external - uses the left part of the screen.",
    "id": "status",
    "display": "-internal",
    "column": {
      "start": 0,
      "end": "25%"
    },
    "row": {
      "start": -30,
      "end": "100%"
    }
  },
  {
    "id": "calculator",
    "display": "-internal",
    "column": {
      "start": 0,
      "end": 500
    },
    "row": {
      "start": -330,
      "end": -30
    }
  },
  {
    "id": "keep",
    "display": "-internal",
    "column": {
      "start": 0,
      "end": "25%"
    },
    "row": {
      "start": "50%",
      "end": -30
    }
  },
  {
    "id": "ssh-profile",
    "display": "-internal",
    "column": {
      "start": 0,
      "end": "20%"
    },
    "row": {
      "start": 0,
      "end": -30
    }
  }
]
```
</details>

<details>
  <summary>Matchers</summary>

```json
[
  {
    "actions": [
      "internal-column2",
      "column3"
    ]
  },
  {
    "actions": [
      "internal-column1",
      "column1"
    ],
    "windowTypes": [
      "app",
      "popup"
    ]
  },
  {
    "actions": [
      "column2"
    ],
    "anyTabUrl": "//mail.google.com/"
  },
  {
    "actions": [
      "internal-music",
      "music"
    ],
    "anyTabUrl": "//www.radiotunes.com/",
    "windowTypes": [
      "popup"
    ]
  },
  {
    "actions": [
      "internal-music",
      "music"
    ],
    "anyTabUrl": "//music.youtube.com/",
    "windowTypes": [
      "popup"
    ]
  },
  {
    "actions": [
      "internal-status",
      "status"
    ],
    "anyTabUrl": "//birnenlabs.com/pwa/status/bar/index.html",
    "windowTypes": [
      "app"
    ]
  },
  {
    "actions": [
      "internal-calculator",
      "calculator"
    ],
    "anyTabUrl": "//birnenlabs.com/pwa/calculator/index.html",
    "windowTypes": [
      "app"
    ]
  },
  {
    "actions": [
      "internal-column1",
      "column1",
      "chat"
    ],
    "anyTabUrl": "//mail.google.com/chat",
    "windowTypes": [
      "app"
    ]
  },
  {
    "actions": [
      "ssh-profile"
    ],
    "anyTabUrl": "chrome-extension://iodihamcpbpeioajjeobimgagajmlibd/html/nassh.html?#profile-id:78ff",
    "windowTypes": [
      "app"
    ]
  },
  {
    "actions": [
      "keep"
    ],
    "anyTabUrl": "//keep.google.com/",
    "windowTypes": [
      "app"
    ]
  },
  {
    "actions": [
      "internal-1-3",
      "1-3"
    ],
    "anyTabUrl": "//messages.google.com/",
    "windowTypes": [
      "popup"
    ]
  },
  {
    "actions": [
      "internal-2-3",
      "2-3"
    ],
    "anyTabUrl": "//www.messenger.com/",
    "windowTypes": [
      "popup"
    ]
  },
  {
    "actions": [
      "internal-3-3",
      "3-3"
    ],
    "anyTabUrl": "//web.whatsapp.com/",
    "windowTypes": [
      "popup"
    ]
  }
]
```
</details>

<details>
  <summary>Settings</summary>

```json
{
  "popupButtonColor": "#f9f9f9",
  "popupBackgroundColor": "white",
  "triggerOnMonitorChange": true,
  "triggerOnWindowCreated": true
}
```
</details>
