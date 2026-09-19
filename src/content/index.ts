import { startCollector } from './collector';
import { startDebug } from './debug';
import { startIntercept } from './intercept';

startIntercept();
startCollector();
startDebug();
