const { AsyncLocalStorage } = require('async_hooks');
const scope = new AsyncLocalStorage();
const currentSignal = () => scope.getStore()?.signal;
const cancelled = () => Object.assign(new Error('Conversion cancelled'), {code:'CANCELLED',name:'AbortError'});
function check(signal = currentSignal()) { if (signal?.aborted) throw cancelled(); }
const isCancelled = error => error?.code === 'CANCELLED' || error?.name === 'AbortError';
const withJob = (signal, work) => scope.run({signal},work);
module.exports = {currentSignal,cancelled,check,isCancelled,withJob};
