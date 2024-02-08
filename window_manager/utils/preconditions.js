/**
 * @template T
 * @param {T|undefined|null} item
 * @return {T}
 */
export function checkNonUndefined(item) {
  if (item === undefined) {
    throw new Error('item is undefined');
  }
  if (item === null) {
    throw new Error('item is null');
  }
  return item;
}
