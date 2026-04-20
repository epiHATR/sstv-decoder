/**
 * Re-exports unified SSTV encoder (Robot36 remains available as encodeRobot36ToPcm).
 */

export {
  appendVisHeader,
  encodeRobot36ToPcm,
  encodeSstvToPcm,
  estimateEncodedSamples,
  estimateRobot36EncodedSamples,
} from './sstv-encode';

export type { SstvEncodeMode } from './sstv-encode';
