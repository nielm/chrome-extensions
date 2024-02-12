import {writeFileSync} from 'fs';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';

/**
 * Run with
 *
 * node generate-schema-validator.mjs
 *
 * to build the jsoneditor/schema-validator.js file.
 */


/**
 * Definitions of schema objects.
 *
 * @see https://ajv.js.org/json-schema.html#json-data-type
 */
const SCHEMA_DEFINITIONS = [
  {
    $id: 'startend',
    title: 'Specification of pixel position in String (%) or number of pixels',
    oneOf: [
      {
        type: 'number',
        minimum: 0,
      },
      {
        type: 'string',
        pattern: '^\\d+(\\.\\d+)?%$',
        minLength: 1,
      },
    ],
  },
  {
    $id: 'rowcol',
    title: 'Specification of start/end positions for row/column values',
    type: 'object',
    properties: {
      comment: {type: 'string'},
      start: {$ref: 'startend'},
      end: {$ref: 'startend'},
    },
    additionalProperties: false,
    required: ['start', 'end'],
  },
  {
    $id: 'action',
    title: 'Definition of the action object type',
    type: 'object',
    properties: {
      comment: {type: 'string'},
      id: {type: 'string', minLength: 1},
      display: {type: 'string', minLength: 1},
      menuName: {type: 'string', minLength: 1},
      shortcutId: {type: 'integer', minimum: 1, maximum: 9},
      column: {$ref: 'rowcol'},
      row: {$ref: 'rowcol'},
    },
    additionalProperties: false,
    required: ['id', 'display', 'row', 'column'],
  }, {
    $id: 'matcher',
    title: 'Definition of the matcher object type',
    type: 'object',
    properties: {
      comment: {type: 'string'},
      actions: {
        type: 'array',
        items: {type: 'string', minLength: 1},
        minItems: 1,
        uniqueItems: true,
      },
      windowTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['normal', 'popup', 'panel', 'app', 'devtools'],
        },
      },
      anyTabUrl: {type: 'string', minLength: 1},
      minTabsNum: {type: 'integer', minimum: 0},
      maxTabsNum: {type: 'integer', minimum: 0},
    },
    additionalProperties: false,
    required: ['actions'],
  },
  {
    $id: 'actions',
    type: 'array',
    items: {$ref: 'action'},
  },
  {
    $id: 'matchers',
    type: 'array',
    items: {$ref: 'matcher'},
  },
  {
    $id: 'settings',
    type: 'object',
    title: 'Definition of the settings object type',
    properties: {
      popupButtonColor: {type: 'string', minLength: 1},
      popupBackgroundColor: {type: 'string', minLength: 1},
      rememberPositionsSetWithShortcut: triggerOnMonitorChange: {type: 'boolean'},
      triggerOnMonitorChange: {type: 'boolean'},
      triggerOnWindowCreated: {type: 'boolean'},
    },
    additionalProperties: false,
  },
];


const ajv = new Ajv({
  schemas: SCHEMA_DEFINITIONS,
  code: {
    source: true,
    esm: true,
  },
  verbose: true,
  allErrors: true,
  $data: true,
  allowUnionTypes: true});

let moduleCode = standaloneCode(ajv);

// Patch moduleCode to remove require('ucs2length'), and replace it with inline
// function which does the same thing.
//
// see https://github.com/ajv-validator/ajv/blob/master/lib/runtime/ucs2length.ts
moduleCode = moduleCode.replace(
    'require("ajv/dist/runtime/ucs2length").default',
    `(str) => {
    const len = str.length;
    let length = 0;
    let pos = 0;
    let value;
    while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 0xd800 && value <= 0xdbff && pos < len) {
            // high surrogate, and there is a next character
            value = str.charCodeAt(pos);
            if ((value & 0xfc00) === 0xdc00)
                pos++; // low surrogate
        }
    }
    return length;
  }`);

moduleCode = '// @ts-nocheck\n' +moduleCode;

const outputFile ='jsoneditor/schema-validator.js';
writeFileSync(outputFile, moduleCode);

console.log(`Written: ${outputFile}`);
