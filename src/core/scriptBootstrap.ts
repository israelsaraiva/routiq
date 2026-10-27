export const SCRIPT_BOOTSTRAP = `(function () {
  var hostMatch = __hostMatch;
  var matcherNames = JSON.parse(__matcherNames);
  var input = JSON.parse(__input);
  var userFunction = __userFunction;
  delete globalThis.__hostMatch;
  delete globalThis.__matcherNames;
  delete globalThis.__input;
  delete globalThis.__userFunction;

  var MAX_CONSOLE_ENTRIES = 500;
  var MAX_CONSOLE_TEXT = 2000;
  var variables = Object.assign({}, input.variables);
  var changes = {};
  var tests = [];
  var consoleEntries = [];
  var fatalError;

  function describeError(error) {
    if (error && error.message !== undefined) return String(error.message);
    return String(error);
  }

  function formatArgument(argument) {
    if (typeof argument === 'string') return argument;
    try {
      var json = JSON.stringify(argument);
      return json === undefined ? String(argument) : json;
    } catch (error) {
      return String(argument);
    }
  }

  function capture(level) {
    return function () {
      if (consoleEntries.length >= MAX_CONSOLE_ENTRIES) return;
      var text = Array.prototype.map.call(arguments, formatArgument).join(' ');
      consoleEntries.push({ level: level, text: text.slice(0, MAX_CONSOLE_TEXT) });
    };
  }

  function buildMatchers(actual, negated) {
    var matchers = {};
    matcherNames.forEach(function (name) {
      matchers[name] = function () {
        var verdict = JSON.parse(hostMatch(name, actual, Array.prototype.slice.call(arguments), negated));
        if (!verdict.pass) throw new Error(verdict.message);
      };
    });
    return matchers;
  }

  function expect(actual) {
    var matchers = buildMatchers(actual, false);
    matchers.not = buildMatchers(actual, true);
    return matchers;
  }

  function recordTest(name, body) {
    var entry = { name: String(name), passed: true };
    tests.push(entry);
    var fail = function (error) { entry.passed = false; entry.message = describeError(error); };
    try {
      var outcome = body();
      if (outcome && typeof outcome.then === 'function') {
        entry.passed = false;
        entry.message = 'async test did not complete';
        outcome.then(function () { entry.passed = true; delete entry.message; }, fail);
      }
    } catch (error) {
      fail(error);
    }
  }

  var headers = {};
  Object.keys(input.response ? input.response.headers : {}).forEach(function (name) { headers[name] = input.response.headers[name]; });

  var rq = {
    variables: {
      get: function (name) { return variables[name]; },
      set: function (name, value) {
        variables[String(name)] = String(value);
        changes[String(name)] = String(value);
      },
    },
    request: input.request,
    response: input.response && {
      status: input.response.status,
      statusText: input.response.statusText,
      timeMs: input.response.timeMs,
      headers: headers,
      body: input.response.body,
      text: function () { return input.response.body; },
      json: function () { return JSON.parse(input.response.body); },
      header: function (name) { return headers[String(name).toLowerCase()]; },
    },
    test: recordTest,
    expect: expect,
  };

  var scriptConsole = Object.freeze({
    log: capture('log'),
    info: capture('info'),
    warn: capture('warn'),
    error: capture('error'),
  });
  Object.freeze(rq);
  Object.freeze(rq.variables);
  Object.defineProperty(globalThis, 'rq', { value: rq, writable: false, configurable: false });
  Object.defineProperty(globalThis, 'console', { value: scriptConsole, writable: false, configurable: false });

  try {
    userFunction();
  } catch (error) {
    fatalError = describeError(error);
  }

  globalThis.__rqFinish = function () {
    return JSON.stringify({ tests: tests, console: consoleEntries, variables: changes, request: rq.request, error: fatalError });
  };
})()`;
