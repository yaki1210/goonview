import { startCollector } from './collector';
import { startDebug } from './debug';
import { startIntercept } from './intercept';
import { startVideoPreview } from './video-preview';

startVideoPreview();
startIntercept();
startCollector();
startDebug();
