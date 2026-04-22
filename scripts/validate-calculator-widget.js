const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function extractCalculatorBody(source) {
  const start = source.indexOf('var CALENDAR_MAX_VISIBLE_EVENTS = 3;');
  const end = source.indexOf('window.toggleWidget = toggleWidget;');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not isolate calculator runtime block');
  }
  return source.slice(start, end);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", received "${actual}"`);
  }
  console.log(`PASS ${label}`);
}

function assert(condition, label) {
  if (!condition) throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
}

const source = read('src/_module_tools_widgets.html');
const context = {
  console,
  Math,
  Date,
  document: {
    widget: {
      attrs: {},
      setAttribute(name, value) {
        this.attrs[name] = value;
      }
    },
    themeLabel: {
      textContent: ''
    },
    display: {
      value: '0',
      className: '',
      scrollLeft: 0,
      scrollWidth: 512,
      setSelectionRange(start, end) {
        this.selection = [start, end];
      },
      classList: {
        add: function(...names) {
          const current = new Set(context.document.display.className.split(/\s+/).filter(Boolean));
          names.forEach((name) => current.add(name));
          context.document.display.className = Array.from(current).join(' ');
        },
        remove: function(...names) {
          const current = new Set(context.document.display.className.split(/\s+/).filter(Boolean));
          names.forEach((name) => current.delete(name));
          context.document.display.className = Array.from(current).join(' ');
        }
      }
    },
    getElementById(id) {
      if (id === 'calc-display') return this.display;
      if (id === 'calc-widget') return this.widget;
      if (id === 'calc-theme-label') return this.themeLabel;
      return null;
    }
  }
};

vm.createContext(context);
vm.runInContext(extractCalculatorBody(source), context);
context.applyCalcTheme();

assertEqual(context.document.widget.attrs['data-calc-theme'], 'classic', 'Classic theme applied by default');
assertEqual(context.document.themeLabel.textContent, 'CLASSIC', 'Classic theme label rendered by default');
context.cycleCalcTheme();
assertEqual(context.document.widget.attrs['data-calc-theme'], 'field', 'Theme cycle advances to field');
assertEqual(context.document.themeLabel.textContent, 'FIELD', 'Field theme label rendered');
context.cycleCalcTheme();
assertEqual(context.document.widget.attrs['data-calc-theme'], 'terminal', 'Theme cycle advances to terminal');
context.cycleCalcTheme();
assertEqual(context.document.widget.attrs['data-calc-theme'], 'classic', 'Theme cycle wraps back to classic');

context.calcNum('1');
context.calcNum('2');
context.calcNum('+');
context.calcNum('3');
context.calcOp('clr');
assertEqual(context.document.display.value, '0', 'Clear resets display to zero');

context.calcNum('1');
context.calcNum('2');
context.calcNum('3');
context.calcNum('4');
context.calcNum('5');
context.calcOp('backspace');
assertEqual(context.document.display.value, '1234', 'Backspace removes one character');

context.calcOp('clr');
context.calcOp('backspace');
assertEqual(context.document.display.value, '0', 'Backspace on empty state stays at zero');

context.calcNum('(');
context.calcOp('=');
assertEqual(context.document.display.value, 'Err', 'Invalid expression renders Err');
context.calcNum('7');
assertEqual(context.document.display.value, '7', 'Typing after Err starts a fresh value');

context.calcOp('clr');
'1234567890123'.split('').forEach((digit) => context.calcNum(digit));
assert(context.document.display.className.includes('calc-display-medium'), 'Medium display class applied for mid-length values');

context.calcOp('clr');
'12345678901234567'.split('').forEach((digit) => context.calcNum(digit));
assert(context.document.display.className.includes('calc-display-small'), 'Small display class applied for long values');

context.calcOp('clr');
'1234567890123456789012'.split('').forEach((digit) => context.calcNum(digit));
assert(context.document.display.className.includes('calc-display-tiny'), 'Tiny display class applied for very long values');
assertEqual(context.document.display.scrollLeft, context.document.display.scrollWidth, 'Display scrolls to keep the right edge visible');

console.log('\nCalculator widget validation passed.');
