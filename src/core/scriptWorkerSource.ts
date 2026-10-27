import { SCRIPT_BOOTSTRAP } from './scriptBootstrap';

const WORKER_BODY = `
const { workerData, parentPort, receiveMessageOnPort } = require('node:worker_threads');
const vm = require('node:vm');

const { source, serializedInput, matcherNames, signalBuffer, replyPort, matcherWaitMs } = workerData;
const bootstrap = ${JSON.stringify(SCRIPT_BOOTSTRAP)};
const signal = new Int32Array(signalBuffer);

function matcherFailure(message) {
  return JSON.stringify({ pass: false, message: message });
}

function askHostMatcher(name, actual, args, negated) {
  var payload;
  try {
    payload = JSON.stringify({ name: String(name), actual: actual, args: args, negated: Boolean(negated) });
  } catch (error) {
    return matcherFailure('assertion arguments are not serializable');
  }
  Atomics.store(signal, 0, 0);
  parentPort.postMessage({ type: 'match', payload: payload });
  if (Atomics.wait(signal, 0, 0, matcherWaitMs) === 'timed-out') {
    return matcherFailure('assertion evaluation timed out');
  }
  var reply = receiveMessageOnPort(replyPort);
  return reply ? reply.message : matcherFailure('assertion evaluation failed');
}

function finish(message) {
  parentPort.postMessage(message);
}

try {
  const sandbox = Object.create(null);
  sandbox.__hostMatch = askHostMatcher;
  sandbox.__matcherNames = JSON.stringify(matcherNames);
  sandbox.__input = serializedInput;
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    microtaskMode: 'afterEvaluate',
  });
  sandbox.__userFunction = vm.compileFunction(source, [], { parsingContext: context, filename: 'rq-script.js' });
  const options = { timeout: workerData.timeoutMs };
  vm.runInContext(bootstrap, context, options);
  finish({ type: 'result', serialized: String(vm.runInContext('__rqFinish()', context, options)) });
} catch (error) {
  finish({ type: 'failure', message: error && error.message !== undefined ? String(error.message) : String(error) });
}
`;

export const SCRIPT_WORKER_SOURCE = WORKER_BODY;
