### Extension

The extension is automatically arranging chrome windows, according to the predefined rules stored as JSON configuration. This extension was created and tested on Chrome OS. It should work on other operating systems but will not be able to organize windows that don't belong to the chrome browser.

### Actions

Action defines how the window should be moved and resized. Following fields are supported:

- `id` - **required**, identifier of the action, used in matchers to reference the action 

- `display` - **required**, name of display, the action will not be performed if the display of given name doesn't exist.
  
  Available values:
  - `primary` - display defined as primary
  - `-primary` - display that is not primary (if there are multiple non primary displays the first one will be used)
  - `internal` - display defined as internal
  - `-internal` - display that is not internal (if there are multiple non internal displays the first one will be used)
  - `[name of the display]` - name of the display, e.g. `DELL U4021QW`.
  
  _Hint: List of displays is printed at the top of the extension options page._

- `shortcutId` - action will be triggered by the shortcut of given id as defined on the [shortcuts page](chrome://extensions/shortcuts).

  _This extension registered 9 shortcuts with an ids from `1` to `9`. Please define the shortcut on the shortcuts page._

- `column` - definition of column, type: `Position`

- `row `- definition of row, type: `Position`

- `menuName` - if set, the action will be shown in the popup menu of extension
  
  _Hint: you can use unicode characters in the menu name._

#### Examples
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


### FAQ

#### How to use multiple displays with priority?
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

### Options page

[Options page](chrome-extension://jjgebfkefchhekbmckeheacgbiicpmim/options.html) can be accessed by right clickng on the extension icon. I contains the following sections:

- Displays
- Options
    - Actions
    - Matchers
    - Settings
