/**
 * Type checked function that combines 2 promises usind the function provided.
 *
 * @template P1
 * @template P2
 * @template R
 *
 * @param {Promise<P1>} promise1
 * @param {Promise<P2>} promise2
 * @param {function(P1, P2): R} combineFn
 * @return {Promise<R>}
 */
export function combine2(promise1, promise2, combineFn) {
  return Promise.all([promise1, promise2]).then((values) => combineFn(values[0], values[1]));
}

/**
 * Type checked function that combines 3 promises usind the function provided.
 *
 * @template P1
 * @template P2
 * @template P3
 * @template R
 *
 * @param {Promise<P1>} promise1
 * @param {Promise<P2>} promise2
 * @param {Promise<P3>} promise3
 * @param {function(P1, P2, P3): R} combineFn
 * @return {Promise<R>}
 */
export function combine3(promise1, promise2, promise3, combineFn) {
  return Promise.all([promise1, promise2, promise3]).then((values) => combineFn(values[0], values[1], values[2]));
}
