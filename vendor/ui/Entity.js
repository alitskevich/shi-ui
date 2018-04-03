import { log } from './utils/fn.js';

let nextId = 1;
/**
 * An Entity is an Identity that bears a state, but has no specific behavior.
 */
export default class Entity {

  constructor(initialState) {
    Object.defineProperty(this, '_id', { value: nextId++ });
    Object.defineProperty(this, 'state', { value: { ...initialState } });
  }

  isEquals(x) {
    return x && (x._id === this._id);
  }

  toString() {

    return `${this.constructor.name}${this._id}`;
  }

  log(...args) {

    return log(this.toString(), ...args);
  }

  keys() {

    return Object.keys(this.state);
  }

  has(key) {

    return key in this.state;
  }

  get(key) {

    return this.state[key];
  }

  set(key, value) {

    return this.update({ [key]: value });
  }

  update(delta) {

    Object.assign(this.state, delta);

    return this;
  }

  valueOf() {

    return this.state;
  }

  map(f) {

    return this.constructor(f(this.valueOf()));
  }

  clone(delta) {

    return this.map(state => ({ ...state, ...delta }));
  }
}
