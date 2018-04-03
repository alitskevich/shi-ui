/* eslint no-console: 0 */
import { getter } from './utils/obj.js';
import { fnId } from './utils/fn.js';
import Template from './Template.js';
import Entity from './Entity.js';
import Property from './Property.js';

/**
 * The base UI component is an Entity that
 * 1) manages its state via properties
 * 2) supports parent/child relationships
 * 3) event-driven
 * 4) life-cycle hooks to be invoked from container
 */
export default class UiComponent extends Entity {

  static registerType = (...ctors) => ctors.forEach(ctor => {

    Template.install(ctor);

    Property.install(ctor);
  });

  static getRegisteredType = Template.getType;

  constructor(initialState, options) {

    super({});

    Object.assign(this, options);

    Property.update(this, initialState);
  }

  ////////////////////////
  // Lifetime hooks
  ///////////////////////

  onInit() {

    this.$isInited = true;
  }

  onDone() {

    if (this.$isDone) {
      return;
    }

    this.$isDone = true;

    if (this.$hasEventHandlers) {

      system.unsubscribe(this._id);
    }

    if (this.$finalizers) {

      this.$finalizers.forEach(fn=>fn.call(this, this));
      this.$finalizers = null;
    }

    if (this.$children) {

      this.forEachChild(c => c.onDone());
      this.$children = null;
    }

    if (this.$parent) {

      this.$parent.removeChild(this.$key);
    }
  }

  onError(error) {

    this.log('error', error);
  }

  addFinalizer(fn) {

    (this.$finalizers || (this.$finalizers = [])).push(fn);
  }

  ////////////////////////
  // Children
  ////////////////////////

  get parent() {

    return this.$parent;
  }

  addChild($key, c) {

    if (c.$parent && c.$parent !== this) {
      c.$parent.removeChild(c);
    }

    c.$key = $key;
    c.$parent = this;

    if (!this.$children) {
      this.$children = new Map();
    }

    this.$children.set($key, c);

    return this;
  }

  getChild($key) {

    return this.$children ? this.$children.get($key) : null;
  }

  removeChild($key) {
    if (this.$children) {
      return this.$children.delete($key);
    }
  }

  forEachChild(fn) {
    if (this.$children) {
      return this.$children.forEach(fn);
    }
  }

  ////////////////////////
  // State
  ///////////////////////

  keys() {

    return this.constructor.$PROP_KEYS;
  }

  has(key) {

    return Property.has(this, key);
  }

  getByKeys(keys = this.keys()) {

    return keys.reduce((r, key)=>{ r[key] = this.get(key); return r; }, {});
  }

  get(key) {

    // memoized
    const memoized = this.$ && getter.call(this.$, key);
    if (typeof memoized !== 'undefined') {

      return memoized;
    }

    // from properties or own member
    const value = getter.call(this, key);
    if (typeof value !== 'undefined') {

      return typeof value === 'function' ? this.memoize(key, value.bind(this)) : value;
    }

    // not found
    return Object.undefined;
  }

  update(delta) {

    const { info, payload } = Property.diff(this, delta);

    if (info.length) {

      Property.update(this, payload);

      this.callChangedHooks(info);
    }

    return info;
  }

  ////////////////////////
  // Rendering
  ///////////////////////

  // implements reaction on component invalidation
  invalidate() {

    return this.render();
  }

  // renders component using given renderer function.
  // By default, renderer function comes from `this.$renderParams.renderer`
  render(renderer = this.$renderParams && this.$renderParams.renderer || fnId) {

    if ( !this.$isDone) {

      renderer(this.resolveTemplate(), this);
    }
  }

  // returns internal structure built on template and current state
  resolveTemplate() {

    return Template.resolve(this);
  }

  // Updates State with given delta
  update(delta) {
    this.updatingDepth = (this.updatingDepth || 0) + 1;
    const changes = super.update(delta);

    if (this.updatingDepth === 1 && this.shouldInvalidateOnUpdate(changes)) {

      this.invalidate();
    }
    this.updatingDepth--;
    return changes;
  }

  // decided if component should Invalidate itself On Update
  shouldInvalidateOnUpdate(changes) {

    return changes.length || Template.hasTransclusion(this);
  }
  ////////////////////////
  // Routines
  ///////////////////////

  callChangedHooks(changed) {

    changed.forEach(({ key, value, oldValue }) => {

      const hook = this.get(`${key}Changed`);
      if (hook) {

        try {

          hook.call(this, { value, oldValue, target: this, id: this.id });

        } catch (ex) {

          this.onError({ ...ex, message: `Error in ${key} hook: ${ex.message}` });
        }
      }
    });
  }

  memoize(key, value) {

    ( this.$ || (this.$ = {}) )[key] = value;

    return value;
  }
  
  // Useful routine implemented typical reaction on click event
  updateOnClick({ dataset }) {

    this.update(dataset);
  }
}
