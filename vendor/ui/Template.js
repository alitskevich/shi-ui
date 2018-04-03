/* eslint no-eq-null: "off" */
import { someOrNull, assert, functionDisplayName } from './utils/fn.js';
import { xmlParse, XmlNode } from './utils/xml.js';
import { objMap } from './utils/obj.js';
import { capitalize } from './utils/str.js';

Object.jsx = (tag, attributes, ...children) => new XmlNode(
    tag,
    attributes,
    children.length ? children.map(e => typeof e === 'string' ? new XmlNode('#text', { text:e }) : e) : null,
  );

const SPECIAL_TAGS = ['else', 'then', 'block', 'children'];
const ITERATOR_PROP = { isReadOnly: true, get: (T, k)=>(T.$ && T.$[k]) };

const COMPONENTS_TYPES = new Map();

const RE_PLACEHOLDER = /\{\{([a-zA-Z0-9\._$]+)\}\}/g;
const RE_SINGLE_PLACEHOLDER = /^\{\{([a-zA-Z0-9\._$]+)\}\}$/;
const RE_IF_PLACEHOLDER = /if="([a-zA-Z0-9\._$\s]+)"/g;
const RE_TAG_PLACEHOLDER = /<[a-z]+:([a-zA-Z0-9\._$\s]+)\s/g;
const RE_EACH_PLACEHOLDER = /each="([a-zA-Z0-9]+?)\sof\s([a-zA-Z0-9\._$\s]+)"/g;

function compileComponentType(elt) {
  const tag = elt.tag;

  if (typeof tag === 'string') {

    const colonPos = tag.indexOf(':');
    if (colonPos !== -1) {
      const key = tag.slice(colonPos + 1);
      elt.resolveComponentType = $ => {
        const type = capitalize($.get(key));
        return COMPONENTS_TYPES.get(type);
      };
    } else if (tag[0] === tag[0].toUpperCase()) {
      elt.resolveComponentType = () => COMPONENTS_TYPES.get(tag);
    }

  } else {

    elt.resolveComponentType = () => tag;
  }
}

function compileAttr(p) {

  if (p.indexOf && p.indexOf('{{') !== -1) {

    if (p.match(RE_SINGLE_PLACEHOLDER)) {

      let key = p.slice(2, -2);

      return $=>$.get(key);
    }

    return $ => p.replace(RE_PLACEHOLDER,
      (s, key)=>{const v = $.get(key); return v == null ? '' : v;});
  }

  return ()=>p;
}

function resolveChildren($, children, keyPrefix) {

  let r = [];
  for (let c of children) {

    const sub = resolveTemplate($, c, keyPrefix);

    if (sub) {

      if (Array.isArray(sub)) {
        r.push(...sub);
      } else {
        r.push(sub);
      }
    }
  }

  return r;
}

function resolveTemplate($, elt, keyPrefix) {

  let { tag, attributes, children, $key,
     eachItemId, eachDataId, ifConditionId, ifElse,
     resolve, resolveComponentType } = elt;

  if (resolve) {

    return resolve.call(elt, $, $key);
  }

  if (ifConditionId && !$.get(ifConditionId)) {

    return ifElse ? resolveTemplate($, ifElse) : null;
  }

  const component = resolveComponentType && resolveComponentType($);

  $key = `${keyPrefix || ''}${component ? component.NAME : ''}${$key}`;

  if (eachItemId) {

    const data = $.get(eachDataId);
    return !data ? null : [].concat(...[...data].map((d, index) => {

      $.memoize(eachItemId, d);

      return resolveTemplate($, { tag, attributes, children, resolveComponentType,
         $key: `${$key}$${someOrNull(d.$id) || someOrNull(d.id) || index}`
      });
    }));
  }

  if (attributes) {
    attributes = objMap(attributes, fn => fn($));

    let props = attributes.props;
    if (props) {

      if (typeof props === 'string') {
        props = JSON.parse(props);
      }

      attributes = { ...props, ...attributes };
    }
  }

  children = !children ? null : resolveChildren($, children, $key + '.');

  if (SPECIAL_TAGS.indexOf(tag) !== -1) {

    return children.map(e=>Object.assign(e, { $key: $key + e.$key }));
  }

  return { tag, component, attributes, children, $key };
}

export function compileTemplate(elt) {

  let { tag, attributes, children } = elt;

  if (tag === 'transclude') {

    elt.resolve = $ => $.$transclude;
    return elt;
  }

  compileComponentType(elt);

  if (attributes) {

    elt.attributes = objMap(attributes, (attr, k) => {

      if (k === 'each') {

        const [scopeId, , dataId] = attr.split(' ');

        elt.eachItemId = scopeId;
        elt.eachDataId = dataId[0] === ':' ? dataId.slice(1) : dataId;

      } else if (k === 'if') {

        elt.ifConditionId = attr[0] === ':' ? attr.slice(1) : attr;
        if (children) {

          const ifElse = children.find(e => e.tag === 'else');
          if (ifElse) {

            elt.ifElse = compileTemplate(ifElse);
            elt.children = children = children.filter(e => e !== ifElse);
          }

          const ifThen = children.find(e => e.tag === 'then');
          if (ifThen) {

            elt.children = children = ifThen.children;
          }
        }

      } else {

        return compileAttr(attr);
      }

    });
  }

  if (children) {

    children.forEach(compileTemplate);
  }

  return elt;
}

/**
 * UI template is constructed from xml markup with control flow and placeholders
 * and then allows to resolve some input data into specific data structure
 * which can be used as input for renderers.
 * This structure defined as follow:
 * type Stru :: { tag:stringOrType, attributes:object, children[Stru], $key:string }
 */
export default class Template {

  static resolve = ($) => $.constructor.$TEMPLATE.resolve($);

  static hasTransclusion = ($) => $.constructor.$HAS_TRANSCLUSION;

  static install = (ctor) => {

    if (!ctor.hasOwnProperty('NAME')) {
      ctor.NAME = functionDisplayName(ctor);
    }

    const name = ctor.NAME;

    const text = ctor.TEMPLATE || `No template for ${name}`;

    if (!ctor.hasOwnProperty('PROPS')) {
      ctor.PROPS = {};
    }

    const ensureProp = (_, _key, prop)=>{
      const key = _key.split('.')[0];
      if ( !ctor.PROPS[key] && !(ctor.prototype.__lookupGetter__(key)) && !ctor.prototype[key]) {
        ctor.PROPS[key] = prop || {};
      }
    };

    ctor.TEMPLATE.replace(RE_EACH_PLACEHOLDER, (s, iteratorKey, key) => {

      ensureProp('', iteratorKey, ITERATOR_PROP);
      ensureProp('', key);
    });

    ctor.TEMPLATE.replace(RE_IF_PLACEHOLDER, ensureProp );
    ctor.TEMPLATE.replace(RE_TAG_PLACEHOLDER, ensureProp );
    ctor.TEMPLATE.replace(RE_PLACEHOLDER, ensureProp );

    const root = compileTemplate(typeof text === 'string' ? xmlParse(text.trim()) : text);

    assert(SPECIAL_TAGS.indexOf(root.tag) === -1, `${name}: Root tag cannot be special tag`);

    const attrs = root.attributes;
    if (attrs) {

      assert(!('each' in attrs), `${name}: Root tag cannot have 'each' directive`);
      assert(!('if' in attrs), `${name}: Root tag cannot have 'if' directive`);
    }

    ctor.$TEMPLATE = new Template(root);
    ctor.$HAS_TRANSCLUSION = text.includes('<transclude');

    if (name[0] !== '$') {

      COMPONENTS_TYPES.set(capitalize(name), ctor);
    }
  }

  static getType = type => COMPONENTS_TYPES.get(capitalize(type));

  constructor(root) {

    this.root = root;
  }

  resolve($) {

    return resolveTemplate($, this.root, $.constructor.NAME);
  }

}
