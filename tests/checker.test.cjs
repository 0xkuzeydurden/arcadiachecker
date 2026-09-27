const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'checker.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'The checker must contain its application script');
const script = new vm.Script(match[1], { filename: 'checker.html' });

// A small DOM double keeps these checks dependency-free and entirely offline.
// Rejecting nonempty innerHTML catches accidental reintroduction of unsafe sinks.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.style = {};
    this.listeners = {};
    this.textContent = '';
    this.value = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(event, handler) {
    this.listeners[event] = handler;
  }

  set innerHTML(value) {
    assert.equal(value, '', 'Untrusted data must never reach innerHTML');
    this.children = [];
  }
}

function createChecker() {
  const ids = new Map();
  const requests = [];
  const document = {
    getElementById(id) {
      if (!ids.has(id)) ids.set(id, new Element('div'));
      return ids.get(id);
    },
    createElement(tag) {
      return new Element(tag);
    },
    createTextNode(text) {
      const element = new Element('#text');
      element.textContent = text;
      return element;
    },
  };
  let response;
  const rejectLog = () => {
    throw new Error('Per-query data must not be written to the console');
  };
  const context = vm.createContext({
    document,
    alert() {},
    console: { log: rejectLog, error: rejectLog, warn: rejectLog, debug: rejectLog },
    fetch: async (url) => {
      assert.ok(response, 'Every request must have a mocked response');
      requests.push(url);
      return response;
    },
  });
  script.runInContext(context);
  return {
    ids,
    requests,
    context,
    respond(body, status = 200) {
      response = { ok: status < 400, status, json: async () => body };
    },
  };
}

const renderedText = (node) => node.textContent + node.children.map(renderedText).join('');

test('formats allocation amounts without changing the Arcadia request endpoint', async () => {
  const checker = createChecker();
  const address = '0x1111111111111111111111111111111111111111';
  for (const [body, amount, display] of [
    [{ amount: '560980000000000000000' }, 560980000000000000000n, '561'],
    [{ amount: '560490000000000000000' }, 560490000000000000000n, '560'],
    [{ amount: '0' }, 0n, '0.00'],
    [{ amount: null }, 0n, '0.00'],
    [{ eligible: false }, 0n, '0.00'],
  ]) {
    checker.respond(body);
    const result = await checker.context.checkAirdrop(address);
    assert.equal(result.amount, amount);
    assert.equal(result.displayAmount, display);
    assert.equal(result.address, address);
  }
  assert.equal(checker.requests.length, 5);
  for (const request of checker.requests) {
    assert.equal(request, 'https://api.arcadia.finance/v1/api/airdrop/user?user_address=' + address);
  }
});

test('renders address input as text and updates result totals', async () => {
  const checker = createChecker();
  const injectedAddress = '0x<img src=x onerror=alert(1)>';
  checker.ids.get('addresses').value = injectedAddress;
  checker.respond({ amount: '1000000000000000000' });
  await checker.ids.get('checkButton').listeners.click();

  const result = checker.ids.get('result-list').children[0];
  assert.equal(result.children[0].tag, 'span');
  assert.equal(result.children[0].textContent, injectedAddress);
  assert.equal(result.children[0].children.length, 0);
  assert.equal(renderedText(result), injectedAddress + ' 1 ARCD');
  assert.equal(checker.ids.get('total-amount').textContent, '1');
  assert.equal(checker.ids.get('checked-count').textContent, 1);
  assert.equal(checker.ids.get('error-count').textContent, 0);
  assert.equal(checker.ids.get('checkButton').disabled, false);
});

test('renders API errors as text and restores the query button', async () => {
  const checker = createChecker();
  checker.ids.get('addresses').value = '0x1111111111111111111111111111111111111111';
  const injectedError = '<svg onload=alert(1)>invalid</svg>';
  checker.respond({ message: injectedError }, 400);
  await checker.ids.get('checkButton').listeners.click();

  const result = checker.ids.get('result-list').children[0];
  assert.equal(result.children[2].textContent, 'Hata: HTTP Hatası: 400 - ' + injectedError);
  assert.equal(result.children[2].children.length, 0);
  assert.equal(checker.ids.get('checked-count').textContent, 0);
  assert.equal(checker.ids.get('error-count').textContent, 1);
  assert.equal(checker.ids.get('checkButton').disabled, false);
});
