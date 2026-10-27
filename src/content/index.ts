import { startCollector } from './collector';
import { startDebug } from './debug';
import { startIntercept } from './intercept';
import { startSelect } from './select';
import { startVideoPreview } from './video-preview';

startVideoPreview();
startIntercept();
startCollector();
startSelect();
startDebug();
